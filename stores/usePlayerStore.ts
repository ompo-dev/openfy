/**
 * Openfy Global Music Player Store (Zustand)
 * Bulletproof centralized state management for Audio Playback, Queue, Navigation, Lyrics, and Persistent Cache.
 * Features:
 * - Atomic Request ID / Generation Lock (prevents race conditions between audio & lyrics)
 * - Two-tier Persistent Cache (In-Memory + AsyncStorage) for zero-latency instant replays
 * - Full Queue Orchestration with Next/Previous, Shuffle, and Repeat (off/all/one)
 * - Synchronized Audio Stream & Lyrics fetching with automatic error recovery
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  loadAndPlay,
  beginTrackChange,
  ensurePlaybackDiagnostics,
  play,
  pause,
  seekTo,
  unload,
  getStatus,
  PlayerState,
  DEFAULT_STATE,
  resolveAudioUrl,
  getPlayableAudioUrl,
  downloadTrack,
  getDownloadedTrack,
  restoreCurrentVolume,
  preloadAudio,
  preloadNativeYouTubeAudio,
  releasePreloadedAudio,
  recordInteraction,
  reportDirectYouTubeStreamRefusal,
  getDirectYouTubeMediaHeaders,
  AudioSourceInput,
  setRemotePlaybackHandlers,
  hasNativeYouTubePlayback,
  parseNativeYouTubePlaybackUri,
  clampPlaybackPositionMs,
  reconcilePlaybackDurationMs,
  resolveSpotifyTrackVideoId,
  resolveCatalogYouTubeVideoId,
  toNativeYouTubePlaybackUri,
} from '@services';
import {
  fetchLyrics,
  LyricsData,
  LyricSegment,
  saveLyricsOffline,
} from '../services/lyrics/lyricsService';
import { normalizeLyricSegments } from '../services/lyrics/lyricTimeline';
import type {
  TrackCatalogMetadata,
  DownloadedTrack,
} from '../services/download/downloadManager';
import { getAppSettings, getCachedAppSettings, subscribeAppSettings, type AudioQuality } from '../services/settings/appSettings';
import { audioQualityCacheKey } from '../services/audio/audioPreferences';
import { log } from '../utils/appLogger';
import { useConnectivityStore } from './useConnectivityStore';
import { showOfflineActionMessage } from '../services/network/offlineFeedback';
import {
  prefetchArtistData,
  prefetchTrackArtistData,
} from '../services/library/artistProfilePrefetch';
import { prefetchTrackAlbumData } from '../services/library/playerAlbum';
import { isSameRecording } from '../services/library/trackIdentity';

export type PlayerTrack = TrackCatalogMetadata & {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  releaseDate?: string;
  localAudioPath?: string;
  localImagePath?: string;
  streamUrl?: string;
  streamExpiresAt?: number;
  streamQuality?: AudioQuality;
  audioQuality?: AudioQuality;
  duration_ms: number;
  videoId?: string;
};

export type RepeatMode = 'off' | 'all' | 'one';

export type PlayerArtworkFrame = { x: number; y: number; width: number; height: number };
export type PlayerArtworkFlight = {
  token: number;
  uri: string;
  source: PlayerArtworkFrame;
};

export interface PlayerStoreState {
  // Current playback
  currentTrack: PlayerTrack | null;
  playerState: PlayerState;
  isPlayerVisible: boolean;
  isFullPlayerVisible: boolean;
  artworkFlight: PlayerArtworkFlight | null;
  isLoadingAudio: boolean;
  isLoadingLyrics: boolean;
  lyricsData: LyricsData | null;

  // Queue & Navigation
  queue: PlayerTrack[];
  queueOriginalOrder: PlayerTrack[];
  queueIndex: number;
  queueSourceId: string | null;
  history: PlayerTrack[];
  isShuffle: boolean;
  repeatMode: RepeatMode;

  // Concurrency & Generation Lock
  activeRequestId: number;

  // Actions
  playTrack: (
    track: PlayerTrack,
    options?: { showPlayer?: boolean; setQueue?: boolean }
  ) => Promise<void>;
  playWithQueue: (
    tracks: PlayerTrack[],
    startIndex?: number,
    sourceId?: string,
    options?: { shuffle?: boolean; continueCurrent?: boolean }
  ) => Promise<void>;
  playDownloadedTrack: (track: DownloadedTrack) => Promise<void>;
  togglePlayPause: (source?: string) => Promise<void>;
  seekToPosition: (ms: number) => Promise<void>;
  playQueueIndex: (index: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  addToQueue: (tracks: PlayerTrack[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setIsPlayerVisible: (visible: boolean) => void;
  setIsFullPlayerVisible: (visible: boolean) => void;
  setArtworkFlight: (flight: PlayerArtworkFlight | null) => void;
  closePlayer: () => Promise<void>;
  refreshLyrics: () => Promise<void>;
  updateLyricsSegments: (segments: LyricSegment[]) => Promise<boolean>;
}

// In-Memory Fast Caches
const lyricsCache = new Map<string, LyricsData>();
const pendingLyricsLoads = new Map<string, Promise<LyricsData | null>>();

// Existing entries were created by native fallback providers. Start new caches
// on canonical backend so iPhone cannot reuse a different song or expired URL.
const LYRICS_CACHE_VERSION = 'v9';
const STORAGE_LYRICS_PREFIX = `openfy_lyrics_cache_${LYRICS_CACHE_VERSION}_`;
const AUDIO_SOURCE_TTL_MS = 10 * 60_000;
const MIN_PRELOADED_SOURCE_LIFETIME_MS = 5_000;

const warmedAudioSources = new Map<
  string,
  { source: AudioSourceInput; expiresAt: number; trackId: string }
>();
const activeAudioWarmups = new Map<string, Promise<void>>();
const queuePreloadKeys = new Set<string>();
const preparedNativeAudio = new Map<string, { bytes: number; expiresAt: number }>();
const pendingNativeAudioPreloads = new Map<string, Promise<number | null>>();
const isAppActiveForPreload = () =>
  !AppState?.currentState || AppState.currentState === 'active';

const shuffleTracks = (tracks: PlayerTrack[]): PlayerTrack[] => {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }
  return shuffled;
};

const findTrackIndex = (tracks: PlayerTrack[], target?: PlayerTrack) => {
  if (!target) return -1;
  const referenceIndex = tracks.findIndex((track) => track === target);
  if (referenceIndex >= 0) return referenceIndex;
  return tracks.findIndex(
    (track) =>
      track.spotifyId === target.spotifyId &&
      track.title === target.title &&
      track.artistName === target.artistName
  );
};

const getResolverTrackId = (track: PlayerTrack): string =>
  track.youtubeVideoId && /^[A-Za-z0-9_-]{11}$/.test(track.youtubeVideoId)
    ? `yt_${track.youtubeVideoId}`
    : track.spotifyId;

const resolveNativeYouTubeSource = async (
  track: PlayerTrack
): Promise<string | null> => {
  if (
    typeof hasNativeYouTubePlayback !== 'function' ||
    !hasNativeYouTubePlayback() ||
    typeof toNativeYouTubePlaybackUri !== 'function'
  ) return null;

  const exactVideoId = track.youtubeVideoId ||
    track.spotifyId.match(/^yt_([A-Za-z0-9_-]{11})$/)?.[1];
  if (exactVideoId && /^[A-Za-z0-9_-]{11}$/.test(exactVideoId)) {
    const source = await resolveCatalogYouTubeVideoId({
      videoId: exactVideoId, title: track.title,
      artists: track.artists?.map((artist) => artist.name) || [track.artistName],
      durationMs: track.duration_ms,
    });
    return source.status === 'resolved'
      ? toNativeYouTubePlaybackUri(source.videoId)
      : null;
  }
  if (typeof resolveSpotifyTrackVideoId !== 'function') return null;

  const match = await resolveSpotifyTrackVideoId(
    track.spotifyId,
    track.title,
    track.artists?.map((artist) => artist.name) || [track.artistName],
    track.duration_ms
  );
  return match.status === 'resolved'
    ? toNativeYouTubePlaybackUri(match.videoId)
    : null;
};

// A film's yt_* id can appear on multiple catalog songs. Include the song
// identity so neither audio nor lyrics warmups leak into the other song.
const getCacheKey = (track: PlayerTrack) => {
  const trackId = track.spotifyId?.trim();
  if (trackId?.startsWith('yt_')) {
    return `track:${JSON.stringify([trackId, track.title, track.artistName, track.duration_ms])}`;
  }
  if (trackId) return `track:${trackId}`;
  const cleanTitle = (track.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  const cleanArtist = (track.artistName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  return `metadata:${cleanArtist}:${cleanTitle}:${track.duration_ms || 0}:${track.albumName || ''}`;
};

const getLockScreenArtworkMetadata = (track: PlayerTrack) => ({
  artworkUrl: track.localImagePath || track.imageURL,
  ...(track.localImagePath && track.imageURL && track.localImagePath !== track.imageURL
    ? { artworkFallbackUrl: track.imageURL }
    : {}),
});

const getLyricsCacheKey = (track: PlayerTrack) =>
  `${getCacheKey(track)}:${LYRICS_CACHE_VERSION}`;

export const getExistingLocalAudioPath = async (
  path?: string
): Promise<string | null> => {
  if (!path || path.endsWith('.m3u8')) return null;

  if (Platform.OS === 'web') return null;

  if (!path.startsWith('file:')) return null;

  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists && (!info.size || info.size > 5000) ? path : null;
  } catch {
    return null;
  }
};

const getSavedAudioSource = async (
  track: (Partial<PlayerTrack> & { audioUrl?: string }) | null | undefined,
  quality: AudioQuality
): Promise<string | null> => {
  if (!track) return null;

  const localPath = await getExistingLocalAudioPath(track.localAudioPath);
  if (localPath) return localPath;

  if (Platform.OS !== 'web') return null;

  const webSource = track.streamUrl || track.audioUrl || track.localAudioPath;
  // Web "downloads" may just be remote URLs, not immutable offline files.
  if (/^https?:/i.test(webSource || '') &&
      (track.streamQuality || track.audioQuality || 'high') !== quality) return null;
  if (
    !webSource ||
    webSource.endsWith('.m3u8') ||
    !/^(https?:|blob:)/i.test(webSource)
  ) {
    return null;
  }

  return getPlayableAudioUrl(webSource);
};

const getWarmedAudioSource = (track: PlayerTrack, quality: AudioQuality): AudioSourceInput | null => {
  const now = Date.now();
  const warmed = warmedAudioSources.get(audioQualityCacheKey(getCacheKey(track), quality));
  return warmed &&
    warmed.trackId === track.spotifyId &&
    warmed.expiresAt > now + MIN_PRELOADED_SOURCE_LIFETIME_MS
    ? warmed.source
    : null;
};

const getFreshPreloadedSource = (
  track: PlayerTrack,
  quality: AudioQuality
): AudioSourceInput | null => {
  const now = Date.now();
  if (
    track.streamUrl &&
    (track.streamQuality || 'high') === quality &&
    (Platform.OS === 'web' ||
      (track.streamExpiresAt || 0) > now + MIN_PRELOADED_SOURCE_LIFETIME_MS)
  ) {
    const headers = typeof getDirectYouTubeMediaHeaders === 'function'
      ? getDirectYouTubeMediaHeaders(track.streamUrl)
      : null;
    return headers ? { uri: track.streamUrl, headers } : track.streamUrl;
  }

  return getWarmedAudioSource(track, quality);
};

const cacheAudioSource = (track: PlayerTrack, source: AudioSourceInput, quality: AudioQuality) => {
  warmedAudioSources.set(audioQualityCacheKey(getCacheKey(track), quality), {
    source,
    expiresAt: Date.now() + AUDIO_SOURCE_TTL_MS,
    trackId: track.spotifyId,
  });
};

const loadLyricsForTrack = (track: PlayerTrack): Promise<LyricsData | null> => {
  const cacheKey = getCacheKey(track);
  const lyricsCacheKey = getLyricsCacheKey(track);
  const cached = lyricsCache.get(lyricsCacheKey);
  if (cached) return Promise.resolve(cached);
  const pending = pendingLyricsLoads.get(lyricsCacheKey);
  if (pending) return pending;

  const loading = (async () => {
    try {
      const stored = await AsyncStorage.getItem(`${STORAGE_LYRICS_PREFIX}${cacheKey}`);
      const edited = lyricsCache.get(lyricsCacheKey);
      if (edited?.source === 'user') return edited;
      if (stored) {
        const lyrics = JSON.parse(stored) as LyricsData;
        lyricsCache.set(lyricsCacheKey, lyrics);
        return lyrics;
      }
    } catch {}

    if (useConnectivityStore.getState().status === 'offline') return null;

    try {
      const lyrics = await fetchLyrics(
        track.title,
        track.artistName,
        track.duration_ms ? track.duration_ms / 1000 : undefined,
        track.albumName
      );
      const edited = lyricsCache.get(lyricsCacheKey);
      if (edited?.source === 'user') return edited;
      if (lyrics) {
        lyricsCache.set(lyricsCacheKey, lyrics);
        void AsyncStorage.setItem(
          `${STORAGE_LYRICS_PREFIX}${cacheKey}`,
          JSON.stringify(lyrics)
        ).catch(() => {});
      }
      return lyrics;
    } catch {
      return null;
    }
  })().finally(() => {
    pendingLyricsLoads.delete(lyricsCacheKey);
  });
  pendingLyricsLoads.set(lyricsCacheKey, loading);
  return loading;
};

const warmTrackLyrics = (track: PlayerTrack, direction: string) => {
  if (useConnectivityStore.getState().status === 'offline') return;
  if (lyricsCache.has(getLyricsCacheKey(track))) return;
  const finishWarmup = log.time('player', 'queue lyrics warmup', {
    trackId: track.spotifyId,
    direction,
  });
  void loadLyricsForTrack(track).then(
    (lyrics) => finishWarmup({ ok: Boolean(lyrics), direction }),
    (error) => finishWarmup({ ok: false, direction, error: String(error) })
  );
};

const warmNativeYouTubeAudio = (videoId: string): Promise<number | null> => {
  const now = Date.now();
  const quality = getCachedAppSettings().streamingQuality;
  const cacheKey = audioQualityCacheKey(videoId, quality);
  const cached = preparedNativeAudio.get(cacheKey);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.bytes);
  preparedNativeAudio.delete(cacheKey);
  const pending = pendingNativeAudioPreloads.get(cacheKey);
  if (pending) return pending;

  const loading = Promise.resolve()
    .then(() => typeof preloadNativeYouTubeAudio === 'function'
      ? preloadNativeYouTubeAudio(videoId, quality)
      : null)
    .then((result) => {
      if (!result?.bytes) return null;
      preparedNativeAudio.set(cacheKey, {
        bytes: result.bytes,
        expiresAt: Date.now() + 4 * 60_000,
      });
      while (preparedNativeAudio.size > 4) {
        const oldest = preparedNativeAudio.keys().next().value;
        if (!oldest) break;
        preparedNativeAudio.delete(oldest);
      }
      return result.bytes;
    })
    .catch(() => null)
    .finally(() => pendingNativeAudioPreloads.delete(cacheKey));
  pendingNativeAudioPreloads.set(cacheKey, loading);
  return loading;
};

const warmTrackAudio = (
  track?: PlayerTrack,
  isStillNeeded: () => boolean = () => true,
  bufferRatio = 0.25,
  prioritizeNativeAudio = false
) => {
  if (!track) return;
  if (!isStillNeeded() || !isAppActiveForPreload()) return;
  if (useConnectivityStore.getState().status === 'offline') return;
  const quality = getCachedAppSettings().streamingQuality;
  const needed = isStillNeeded;
  isStillNeeded = () => needed() && quality === getCachedAppSettings().streamingQuality;
  const cacheKey = audioQualityCacheKey(getCacheKey(track), quality);
  const durationSeconds = Math.max(0, track.duration_ms || 0) / 1000;
  const preferredForwardBufferDuration = durationSeconds
    ? Math.max(5, Math.round(durationSeconds * bufferRatio))
    : 5;
  const suppliedSource = getFreshPreloadedSource(track, quality);
  if (suppliedSource) {
    const suppliedNativeVideoId = typeof suppliedSource === 'string'
      ? parseNativeYouTubePlaybackUri(suppliedSource)
      : null;
    if (suppliedNativeVideoId) {
      const finishWarmup = log.time('player', 'queue neighbor warmup', {
        trackId: track.spotifyId,
        bufferRatio,
      });
      void (async () => {
        const bytes = prioritizeNativeAudio && isStillNeeded()
          ? await warmNativeYouTubeAudio(suppliedNativeVideoId)
          : null;
        finishWarmup({
          ok: !prioritizeNativeAudio || Boolean(bytes),
          source: bytes ? 'native-audio-buffer' : 'native-video-id-only',
          audioPrepared: Boolean(bytes),
          preparedBytes: bytes || 0,
          trackId: track.spotifyId,
          bufferRatio,
        });
      })();
      return;
    }
    if (isStillNeeded()) {
      const finishWarmup = log.time('player', 'queue neighbor warmup', {
        trackId: track.spotifyId,
        bufferRatio,
      });
      void preloadAudio(suppliedSource, preferredForwardBufferDuration).then(
        () => finishWarmup({ ok: true, source: 'source-cache' }),
        (error) => finishWarmup({ ok: false, error: String(error) })
      );
    }
    return;
  }
  if (activeAudioWarmups.has(cacheKey)) return;

  const finishWarmup = log.time('player', 'queue neighbor warmup', {
    trackId: track.spotifyId,
    bufferRatio,
  });
  let sourceKind = 'stream';
  let warmupError: unknown;
  let preparedBytes = 0;
  const warmup = (async () => {
    const directSavedSource = await getSavedAudioSource(track, quality);
    if (directSavedSource) {
      cacheAudioSource(track, directSavedSource, quality);
      sourceKind = 'saved-audio';
      if (isStillNeeded()) await preloadAudio(directSavedSource, preferredForwardBufferDuration);
      return;
    }

    const downloaded = await getDownloadedTrack(track.spotifyId);
    const downloadedSavedSource = await getSavedAudioSource(downloaded, quality);
    if (downloadedSavedSource) {
      cacheAudioSource(track, downloadedSavedSource, quality);
      sourceKind = 'saved-audio';
      if (isStillNeeded()) await preloadAudio(downloadedSavedSource, preferredForwardBufferDuration);
      return;
    }

    if (useConnectivityStore.getState().status === 'offline') {
      sourceKind = 'offline';
      return;
    }

    if (typeof hasNativeYouTubePlayback === 'function' && hasNativeYouTubePlayback()) {
      const nativeSource = await resolveNativeYouTubeSource(track);
      if (!nativeSource || !isStillNeeded()) {
        sourceKind = 'unresolved';
        return;
      }
      const videoId = parseNativeYouTubePlaybackUri(nativeSource);
      cacheAudioSource(track, nativeSource, quality);
      sourceKind = 'native-video-id-only';
      if (prioritizeNativeAudio && videoId) {
        preparedBytes = (await warmNativeYouTubeAudio(videoId)) || 0;
        if (preparedBytes > 0) sourceKind = 'native-audio-buffer';
      }
      return;
    }

    if (!isStillNeeded() || !isAppActiveForPreload() || getFreshPreloadedSource(track, quality)) return;
    const resolved = await resolveAudioUrl(
      track.title,
      track.artistName,
      getResolverTrackId(track),
      track.duration_ms,
      track.releaseDate,
      false,
      quality
    );
    if (resolved?.url && isStillNeeded()) {
      const source = resolved.headers
        ? { uri: resolved.url, headers: resolved.headers }
        : resolved.url;
      cacheAudioSource(track, source, quality);
      await preloadAudio(source, preferredForwardBufferDuration);
    } else {
      sourceKind = 'unresolved';
    }
  })()
    .catch((error) => {
      warmupError = error;
    })
    .finally(() => {
      activeAudioWarmups.delete(cacheKey);
      finishWarmup({
        ok: !warmupError && sourceKind !== 'unresolved',
        source: sourceKind,
        audioPrepared: preparedBytes > 0,
        preparedBytes,
        trackId: track.spotifyId,
        bufferRatio,
        preferredForwardBufferDuration,
        ...(warmupError ? { error: String(warmupError) } : {}),
      });
    });

  activeAudioWarmups.set(cacheKey, warmup);
};

const warmQueueNeighbors = (queue: PlayerTrack[], queueIndex: number) => {
  if (!getCachedAppSettings().preloadNextTrack) return;
  if (Platform.OS !== 'web' && !isAppActiveForPreload()) return;
  const currentTrack = queue[queueIndex];
  const neighbors = [
    { track: queue[queueIndex + 1], ratio: 0.5, direction: 'next' },
    { track: queue[queueIndex - 1], ratio: 0.25, direction: 'previous' },
    { track: queue[queueIndex + 2], ratio: 0.25, direction: 'next-two' },
    { track: queue[queueIndex - 2], ratio: 0.125, direction: 'previous-two' },
  ].filter((neighbor): neighbor is {
    track: PlayerTrack;
    ratio: number;
    direction: string;
  } => Boolean(neighbor.track));
  const retainedKeys = new Set(
    [currentTrack, ...neighbors.map(({ track }) => track)]
      .filter((track): track is PlayerTrack => Boolean(track))
      .map((track) => audioQualityCacheKey(getCacheKey(track), getCachedAppSettings().streamingQuality))
  );

  queuePreloadKeys.clear();
  const quality = getCachedAppSettings().streamingQuality;
  neighbors.forEach(({ track }) => queuePreloadKeys.add(audioQualityCacheKey(getCacheKey(track), quality)));

  warmedAudioSources.forEach(({ source }, cacheKey) => {
    if (!retainedKeys.has(cacheKey)) {
      warmedAudioSources.delete(cacheKey);
      releasePreloadedAudio(source);
    }
  });

  neighbors.forEach(({ track, ratio, direction }) => {
    log.player('queue preloading target', {
      direction,
      trackId: track.spotifyId,
      bufferRatio: ratio,
    });
    prefetchArtistData(track.artists?.length
      ? track.artists
      : track.artistName
          .split(/\s*(?:,|&| feat\.?)\s*/i)
          .filter(Boolean)
          .map((name) => ({ name })));
    warmTrackLyrics(track, direction);
    warmTrackAudio(
      track,
      () => isAppActiveForPreload() && quality === getCachedAppSettings().streamingQuality &&
        queuePreloadKeys.has(audioQualityCacheKey(getCacheKey(track), quality)),
      ratio,
      true
    );
  });
};

export const usePlayerStore = create<PlayerStoreState>((set, get) => ({
  currentTrack: null,
  playerState: DEFAULT_STATE,
  isPlayerVisible: false,
  isFullPlayerVisible: false,
  artworkFlight: null,
  isLoadingAudio: false,
  isLoadingLyrics: false,
  lyricsData: null,
  queue: [],
  queueOriginalOrder: [],
  queueIndex: 0,
  queueSourceId: null,
  history: [],
  isShuffle: false,
  repeatMode: 'off',
  activeRequestId: 0,

  setIsPlayerVisible: (visible: boolean) => {
    set({ isPlayerVisible: visible });
  },
  setIsFullPlayerVisible: (visible: boolean) => {
    set({ isFullPlayerVisible: visible, ...(visible ? {} : { artworkFlight: null }) });
  },
  setArtworkFlight: (flight: PlayerArtworkFlight | null) => {
    set({ artworkFlight: flight });
  },

  playTrack: async (track: PlayerTrack, options = {}) => {
    const { showPlayer = true, setQueue = true } = options;
    let hasSavedWebDownload = false;
    let offlinePlaybackBlocked = false;

    if (useConnectivityStore.getState().status === 'offline') {
      const localTrackAudio = await getExistingLocalAudioPath(track.localAudioPath);
      const downloaded = localTrackAudio ? null : await getDownloadedTrack(track.spotifyId);
      const downloadedAudio = localTrackAudio
        ? localTrackAudio
        : await getExistingLocalAudioPath(downloaded?.localAudioPath);
      if (!downloadedAudio) {
        showOfflineActionMessage();
        return;
      }
    }

    // 1. ATOMIC GENERATION LOCK 🔒: Increments request counter to cancel any stale in-flight fetches
    const requestId = get().activeRequestId + 1;
    const finishTransition = log.time('player', 'track transition', {
      requestId,
      trackId: track.spotifyId,
      title: track.title,
    });
    try {
      beginTrackChange();
    } catch (error) {
      finishTransition({ ok: false, stage: 'begin-track-change' });
      set({ isLoadingAudio: false, playerState: { ...DEFAULT_STATE, error: String(error) } });
      return;
    }
    const cacheKey = getCacheKey(track);
    const lyricsCacheKey = getLyricsCacheKey(track);
    console.log(
      `[PlayerStore #${requestId}] Requested: "${track.artistName} - ${track.title}"`
    );

    // Check if we have cached lyrics in memory
    const cachedLyrics = lyricsCache.get(lyricsCacheKey) || null;

    // Immediate UI state update with synchronized target track
    set({
      activeRequestId: requestId,
      currentTrack: track,
      isPlayerVisible: showPlayer ? true : get().isPlayerVisible,
      isLoadingAudio: true,
      isLoadingLyrics: !cachedLyrics,
      lyricsData: cachedLyrics,
      playerState: {
        ...DEFAULT_STATE,
        isBuffering: true,
        durationMs: track.duration_ms || 0,
      },
      ...(setQueue
        ? {
            queue: [track],
            queueOriginalOrder: [track],
            queueIndex: 0,
            queueSourceId: null,
            isShuffle: false,
          }
        : {}),
    });
    // 2. CONCURRENT AUDIO STREAM RESOLUTION & PERSISTENT CACHE
    const resolveAudioPromise = (async (): Promise<AudioSourceInput | null> => {
      await getAppSettings();
      const quality = getCachedAppSettings().streamingQuality;
      const hasFreshTrackStream = Boolean(
        track.streamUrl &&
        (Platform.OS === 'web' ||
          (track.streamExpiresAt || 0) >
            Date.now() + MIN_PRELOADED_SOURCE_LIFETIME_MS)
      );
      if (hasFreshTrackStream) {
        const trackStream = getFreshPreloadedSource(track, quality);
        if (trackStream) {
          cacheAudioSource(track, trackStream, quality);
          return trackStream;
        }
      }

      const preloadedSource = getWarmedAudioSource(track, quality);
      if (preloadedSource) {
        return preloadedSource;
      }

      const directSavedSource = await getSavedAudioSource(track, quality);
      if (directSavedSource) {
        cacheAudioSource(track, directSavedSource, quality);
        hasSavedWebDownload = Platform.OS === 'web';
        return directSavedSource;
      }

      const activeWarmup = activeAudioWarmups.get(audioQualityCacheKey(cacheKey, quality));
      if (activeWarmup) {
        await activeWarmup;
        const warmedSource = getWarmedAudioSource(track, quality);
        if (warmedSource) return warmedSource;
      }

      const downloaded = await getDownloadedTrack(track.spotifyId);
      const downloadedSavedSource = await getSavedAudioSource(downloaded, quality);
      if (downloadedSavedSource) {
        cacheAudioSource(track, downloadedSavedSource, quality);
        hasSavedWebDownload = Platform.OS === 'web';
        return downloadedSavedSource;
      }

      if (useConnectivityStore.getState().status === 'offline') {
        offlinePlaybackBlocked = true;
        return null;
      }

      const nativeYouTubeSource = await resolveNativeYouTubeSource(track);
      if (nativeYouTubeSource) return nativeYouTubeSource;

      const resolved = await resolveAudioUrl(
        track.title,
        track.artistName,
        getResolverTrackId(track),
        track.duration_ms,
        track.releaseDate,
        false,
        quality
      );

      if (resolved?.url) {
        const source: AudioSourceInput = resolved.headers
          ? { uri: resolved.url, headers: resolved.headers }
          : resolved.url;
        cacheAudioSource(track, source, quality);
        return source;
      }

      return null;
    })();

    const startLyricsLoading = () => {
      if (cachedLyrics) return;
      void loadLyricsForTrack(track).then((lyrics) => {
        if (get().activeRequestId === requestId && get().lyricsData?.source !== 'user') {
          set({ lyricsData: lyrics, isLoadingLyrics: false });
        }
      });
    };

    startLyricsLoading();

    // Execute Audio resolution
    const finishResolution = log.time('player', 'audio source resolution', {
      requestId,
      trackId: track.spotifyId,
    });
    const streamSource = await resolveAudioPromise.catch((error) => {
      console.warn('[PlayerStore] Source loading failed:', error);
      return null;
    });
    finishResolution({ ok: Boolean(streamSource), trackId: track.spotifyId });

    // RACE CONDITION CHECK: Discard if user clicked another track in the meantime
    if (get().activeRequestId !== requestId) {
      finishTransition({ ok: false, stale: true, stage: 'source-resolution' });
      console.log(
        `[PlayerStore #${requestId}] Discarding stale playback response for "${track.title}"`
      );
      return;
    }

    if (!streamSource) {
      finishTransition({ ok: false, stage: 'source-resolution' });
      console.warn(
        `[PlayerStore #${requestId}] Failed to resolve audio for: "${track.title}"`
      );
      set({
        isLoadingAudio: false,
        playerState: {
          ...DEFAULT_STATE,
          error: 'Não foi possível carregar o áudio desta faixa.',
        },
      });
      if (offlinePlaybackBlocked) showOfflineActionMessage();
      void ensurePlaybackDiagnostics(track).catch(() => {});
      // Resolution failed for the selected id. Dispose the paused previous
      // engine so no later native/lock-screen command can resume another song.
      await unload();
      if (get().activeRequestId === requestId) {
        await restoreCurrentVolume();
      }
      return;
    }

    let activeStreamUri =
      typeof streamSource === 'string' ? streamSource : streamSource.uri;
    let isRecoveringStream = false;
    let recoveryAttempts = 0;
    let recoveryResumePositionMs: number | null = null;
    const MAX_CONSECUTIVE_RECOVERIES = 3;
    const RECOVERY_STABLE_MS = 10_000;
    let initialLoadInProgress = true;
    let handledTrackFinish = false;
    let durationLimitReached = false;
    let lastPlaybackPositionMs = 0;

    console.log(`[PlayerStore #${requestId}] Playing stream:`, activeStreamUri);
    if (get().activeRequestId !== requestId) return;

    /**
     * Returns true when the error message is indicative of a server-side
     * stream refusal (4xx / expired URL). Returns false for local failures
     * such as decoder errors, network timeouts, or media services resets so
     * we avoid penalising healthy player clients for non-refusal failures.
     */
    const isLikelyStreamRefusal = (error: string): boolean =>
      /403|404|410|forbidden|expired|gone|not\s+found|unauthorized/i.test(
        error
      );

    // Audio status update handler with transparent stream recovery
    const handleStatusUpdate = (state: PlayerState) => {
      // Only process updates if this track is still the active one
      if (get().activeRequestId !== requestId) return;

      if (state.isLoaded && !state.error) lastPlaybackPositionMs = state.positionMs;

      const currentDuration = reconcilePlaybackDurationMs(
        state.durationMs,
        track.duration_ms
      );
      const currentPosition = clampPlaybackPositionMs(
        state.positionMs,
        currentDuration
      );
      const reachedCanonicalDuration = Boolean(
        state.isLoaded &&
        state.isPlaying &&
        currentDuration > 0 &&
        state.positionMs >= currentDuration
      );
      if (reachedCanonicalDuration && !durationLimitReached) {
        // Some native/remote players expose a duplicated timeline with a
        // silent tail. Stop the engine at the catalog duration as well as
        // clamping the UI, so the tail can never be heard or reported.
        durationLimitReached = true;
        void pause();
      } else if (
        state.isPlaying &&
        currentDuration > 0 &&
        currentPosition < currentDuration - 500
      ) {
        durationLimitReached = false;
      }
      if (state.isPlaying && !state.didJustFinish && !reachedCanonicalDuration) {
        handledTrackFinish = false;
      }
      set({
        isLoadingAudio: false,
        playerState: {
          ...state,
          positionMs: currentPosition,
          durationMs: currentDuration,
        },
      });

      // Reset consecutive recovery counter once stream has played stably past resume position
      if (
        recoveryAttempts > 0 &&
        recoveryResumePositionMs !== null &&
        state.isPlaying &&
        !state.error &&
        state.positionMs >= recoveryResumePositionMs + RECOVERY_STABLE_MS
      ) {
        recoveryAttempts = 0;
        recoveryResumePositionMs = null;
      }

      // Mid-stream error auto-recovery (e.g. 403 or expired Googlevideo URL during playback)
      // Guarded against initial-load errors (handled exclusively by loadAndPlay fallback)
      // and limited to MAX_CONSECUTIVE_RECOVERIES to prevent infinite recovery loops on repeated immediate failures.
      if (
        state.error &&
        !initialLoadInProgress &&
        !isRecoveringStream &&
        recoveryAttempts < MAX_CONSECUTIVE_RECOVERIES &&
        activeStreamUri
      ) {
        isRecoveringStream = true;
        recoveryAttempts++;
        const lastPosMs = state.positionMs || lastPlaybackPositionMs;
        recoveryResumePositionMs = lastPosMs;
        const errorMsg = state.error ?? '';
        const isRefusal = isLikelyStreamRefusal(errorMsg);
        console.warn(
          `[PlayerStore #${requestId}] Stream error for "${track.title}" at ${lastPosMs}ms (attempt ${recoveryAttempts}/${MAX_CONSECUTIVE_RECOVERIES}): ${errorMsg}. isRefusal=${isRefusal}. Triggering auto-recovery...`
        );
        void (async () => {
          try {
            if (activeStreamUri.startsWith('file:')) {
              // A downloaded song must recover from its file, even offline.
              const recoveredOk = await loadAndPlay(
                activeStreamUri, handleStatusUpdate,
                { title: track.title, artist: track.artistName,
                  albumTitle: track.albumName, ...getLockScreenArtworkMetadata(track) },
                0, track
              );
              if (get().activeRequestId === requestId && recoveredOk && lastPosMs > 1000) {
                await seekTo(lastPosMs);
              }
              return;
            }
            const nativeVideoId =
              typeof parseNativeYouTubePlaybackUri === 'function'
                ? parseNativeYouTubePlaybackUri(activeStreamUri)
                : null;
            if (nativeVideoId) {
              const recoveredOk = await loadAndPlay(
                activeStreamUri,
                handleStatusUpdate,
                {
                  title: track.title,
                  artist: track.artistName,
                  albumTitle: track.albumName,
                  ...getLockScreenArtworkMetadata(track),
                },
                0,
                track
              );
              if (get().activeRequestId === requestId && recoveredOk && lastPosMs > 1000) {
                await seekTo(lastPosMs);
              }
              return;
            }
            if (isRefusal && activeStreamUri) {
              await reportDirectYouTubeStreamRefusal(activeStreamUri, 403);
            }
            const recoveryQuality = getCachedAppSettings().streamingQuality;
            const recovered = await resolveAudioUrl(
              track.title,
              track.artistName,
              getResolverTrackId(track),
              track.duration_ms,
              undefined,
              true,
              recoveryQuality
            );
            if (get().activeRequestId === requestId && recovered?.url) {
              activeStreamUri = recovered.url;
              const newSource: AudioSourceInput = recovered.headers
                ? { uri: recovered.url, headers: recovered.headers }
                : recovered.url;
              cacheAudioSource(track, newSource, recoveryQuality);
              console.log(
                `[PlayerStore #${requestId}] Auto-recovered stream for "${track.title}"; resuming at ${lastPosMs}ms`
              );
              const recoveredOk = await loadAndPlay(
                newSource,
                handleStatusUpdate,
                {
                  title: track.title,
                  artist: track.artistName,
                  albumTitle: track.albumName,
                  ...getLockScreenArtworkMetadata(track),
                },
                0,
                track
              );
              if (get().activeRequestId === requestId && recoveredOk && lastPosMs > 1000) {
                await seekTo(lastPosMs);
              }
            }
          } catch (error) {
            console.warn('[PlayerStore] Playback recovery failed:', error);
          } finally {
            isRecoveringStream = false;
          }
        })();
        return;
      }

      // Auto-advance detection on track finish
      if (
        state.isLoaded &&
        !handledTrackFinish &&
        (state.didJustFinish ||
          (currentPosition > 0 &&
            currentDuration > 0 &&
            currentPosition >= currentDuration))
      ) {
        handledTrackFinish = true;
        const repeat = get().repeatMode;
        if (repeat === 'one') {
          void seekTo(0).then(() => play());
        } else {
          get().playNext();
        }
      }
    };

    let success = false;
    try {
      success = await loadAndPlay(
        streamSource,
        handleStatusUpdate,
        {
          title: track.title,
          artist: track.artistName,
          albumTitle: track.albumName,
          ...getLockScreenArtworkMetadata(track),
        },
        0,
        track,
        { trackChangeAlreadyBegun: true }
      );
    } catch (error) {
      finishTransition({ ok: false, stage: 'native-load', error: String(error) });
      throw error;
    }
    finishTransition({ ok: success, stage: 'native-load', trackId: track.spotifyId });

    initialLoadInProgress = false;

    if (get().activeRequestId !== requestId) return;

    if (success) {
      prefetchTrackArtistData(track);
      prefetchTrackAlbumData(track);
      void ensurePlaybackDiagnostics(track).catch(() => {});
      recordInteraction(track, 'play').catch(() => {});
      warmQueueNeighbors(get().queue, get().queueIndex);
      set((state) => ({
        isLoadingAudio: false,
        history: [track, ...state.history.slice(0, 49)],
      }));

      // Keep native background playback focused on the active audio session.
      // Explicit downloads still use DownloadContext; this opportunistic cache
      // is only safe on web where it cannot trigger iOS background termination.
      if (
        Platform.OS === 'web' &&
        track.spotifyId &&
        !activeStreamUri.startsWith('file:') &&
        !hasSavedWebDownload
      ) {
        const isMp3 =
          activeStreamUri.includes('.mp3') || !activeStreamUri.includes('.m4a');
        downloadTrack(
          {
            ...track,
            spotifyId: track.spotifyId,
            title: track.title,
            artistName: track.artistName,
            albumName: track.albumName,
            imageURL: track.imageURL,
            duration_ms: track.duration_ms,
          },
          activeStreamUri,
          isMp3 ? 'mp3' : 'm4a'
        ).catch(() => {});
      }
    } else {
      startLyricsLoading();
      void ensurePlaybackDiagnostics(track).catch(() => {});
      const playerState = get().playerState;
      const loadError = playerState.error ?? '';
      const isRefusal = isLikelyStreamRefusal(loadError);
      console.warn(
        `[PlayerStore #${requestId}] Initial playback failed. isRefusal=${isRefusal}. Retrying with fresh resolution...`
      );
      if (isRefusal && activeStreamUri) {
        await reportDirectYouTubeStreamRefusal(activeStreamUri, 403);
      }
      const fallbackQuality = getCachedAppSettings().streamingQuality;
      const fallbackResolved = await resolveAudioUrl(
        track.title,
        track.artistName,
        getResolverTrackId(track),
        track.duration_ms,
        undefined,
        true,
        fallbackQuality
      );
      if (get().activeRequestId === requestId && fallbackResolved?.url) {
        activeStreamUri = fallbackResolved.url;
        const newSource: AudioSourceInput = fallbackResolved.headers
          ? { uri: fallbackResolved.url, headers: fallbackResolved.headers }
          : fallbackResolved.url;
        cacheAudioSource(track, newSource, fallbackQuality);
        await loadAndPlay(
          newSource,
          handleStatusUpdate,
          {
            title: track.title,
            artist: track.artistName,
            albumTitle: track.albumName,
            ...getLockScreenArtworkMetadata(track),
          },
          0,
          track
        );
      }
    }
  },

  playWithQueue: async (
    tracks: PlayerTrack[],
    startIndex = 0,
    sourceId?: string,
    options = {}
  ) => {
    if (!tracks || tracks.length === 0) return;
    const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const originalQueue = [...tracks];
    const shouldShuffle = Boolean(options.shuffle);
    const current = get().currentTrack;
    if (options.continueCurrent && current && !get().isLoadingAudio &&
      get().playerState.isLoaded && !get().playerState.error) {
      const isCurrent = (track: PlayerTrack) => isSameRecording(current, track);
      if (originalQueue.some(isCurrent)) {
        const nextQueue = [current, ...originalQueue.filter((track) => !isCurrent(track))];
        set({ queue: nextQueue, queueOriginalOrder: nextQueue, queueIndex: 0,
          queueSourceId: sourceId ?? null, isShuffle: false });
        if (!getStatus().isPlaying) await get().togglePlayPause('listen-album');
        warmQueueNeighbors(get().queue, get().queueIndex);
        return;
      }
    }
    const playbackQueue = shouldShuffle && tracks.length > 1
      ? shuffleTracks(originalQueue)
      : originalQueue;
    const playbackIndex = shouldShuffle ? 0 : safeIndex;
    set({
      queue: playbackQueue,
      queueOriginalOrder: originalQueue,
      queueIndex: playbackIndex,
      queueSourceId: sourceId ?? null,
      isShuffle: shouldShuffle,
    });
    await get().playTrack(playbackQueue[playbackIndex], { setQueue: false });
  },

  playDownloadedTrack: async (downloaded: DownloadedTrack) => {
    const playerTrack: PlayerTrack = {
      ...downloaded,
      spotifyId: downloaded.spotifyId,
      title: downloaded.title,
      artistName: downloaded.artistName,
      albumName: downloaded.albumName || 'Download',
      imageURL: downloaded.localImagePath || downloaded.imageURL,
      localAudioPath: downloaded.localAudioPath,
      streamUrl: downloaded.audioUrl,
      duration_ms: downloaded.duration_ms || 0,
    };
    await get().playTrack(playerTrack);
  },

  togglePlayPause: async (source = 'player-control') => {
    const { currentTrack, playTrack } = get();

    // Always read real-time state from playerService (not Zustand state which can be stale)
    // This ensures pause works from any screen: banners, carrossel, etc.
    const realState = getStatus();
    if (get().isLoadingAudio && !realState.isLoaded && !realState.isPlaying) return;

    if (
      useConnectivityStore.getState().status === 'offline' &&
      !realState.isPlaying &&
      currentTrack
    ) {
      const localTrackAudio = await getExistingLocalAudioPath(currentTrack.localAudioPath);
      const downloaded = localTrackAudio
        ? null
        : await getDownloadedTrack(currentTrack.spotifyId);
      const downloadedAudio = localTrackAudio
        ? localTrackAudio
        : await getExistingLocalAudioPath(downloaded?.localAudioPath);
      if (!downloadedAudio) {
        showOfflineActionMessage();
        return;
      }
    }

    if (!realState.isLoaded && currentTrack) {
      await playTrack(currentTrack, { setQueue: false });
      return;
    }

    if (realState.isPlaying) {
      await pause(`toggle:${source}`);
      // Sync Zustand state immediately so UI reflects change
      set((s) => ({ playerState: { ...s.playerState, isPlaying: false } }));
    } else {
      await play();
      set((s) => ({ playerState: { ...s.playerState, isPlaying: true } }));
    }
  },

  seekToPosition: async (ms: number) => {
    await seekTo(ms);
  },

  playQueueIndex: async (index: number) => {
    const { queue, playTrack } = get();
    if (!Number.isInteger(index) || index < 0 || index >= queue.length) return;

    set({ queueIndex: index });
    await playTrack(queue[index], { setQueue: false });
  },

  playNext: async () => {
    const { queue, queueIndex, repeatMode, playTrack } = get();
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        return; // End of queue
      }
    }

    const finishTransition = log.time('player', 'queue next transition', {
      fromIndex: queueIndex,
      toIndex: nextIndex,
      queueLength: queue.length,
    });
    set({ queueIndex: nextIndex });
    await playTrack(queue[nextIndex], { setQueue: false });
    finishTransition({ ok: true, trackId: queue[nextIndex].spotifyId });
  },

  playPrevious: async () => {
    const { queue, queueIndex, playerState, repeatMode, playTrack } = get();
    if (queue.length === 0) return;

    // If already playing for more than 3 seconds, restart current track
    if (playerState.positionMs > 3000) {
      log.player('queue previous restarted current track', { queueIndex });
      await seekTo(0);
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      if (repeatMode !== 'all') return;
      prevIndex = queue.length - 1;
    }

    const finishTransition = log.time('player', 'queue previous transition', {
      fromIndex: queueIndex,
      toIndex: prevIndex,
      queueLength: queue.length,
    });
    set({ queueIndex: prevIndex });
    await playTrack(queue[prevIndex], { setQueue: false });
    finishTransition({ ok: true, trackId: queue[prevIndex].spotifyId });
  },

  addToQueue: (tracks: PlayerTrack[]) => {
    set((state) => ({
      queue: [...state.queue, ...tracks],
      queueOriginalOrder: [...state.queueOriginalOrder, ...tracks],
    }));
  },

  removeFromQueue: (index: number) => {
    set((state) => {
      if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) {
        return state;
      }
      const newQueue = [...state.queue];
      const [removedTrack] = newQueue.splice(index, 1);
      const newIndex =
        index < state.queueIndex
          ? Math.max(0, state.queueIndex - 1)
          : state.queueIndex >= newQueue.length
          ? Math.max(0, newQueue.length - 1)
          : state.queueIndex;
      const originalIndex = findTrackIndex(
        state.queueOriginalOrder,
        removedTrack
      );
      const newOriginalOrder = [...state.queueOriginalOrder];
      if (originalIndex >= 0) newOriginalOrder.splice(originalIndex, 1);
      return {
        queue: newQueue,
        queueOriginalOrder: newOriginalOrder,
        queueIndex: newIndex,
      };
    });
  },

  clearQueue: () => {
    set({
      queue: [],
      queueOriginalOrder: [],
      queueIndex: 0,
      queueSourceId: null,
      isShuffle: false,
    });
  },

  toggleShuffle: () => {
    const state = get();
    if (state.queue.length < 2) {
      set({ isShuffle: !state.isShuffle });
      return;
    }

    const currentTrack = state.queue[state.queueIndex];
    if (state.isShuffle) {
      const restoredQueue = state.queueOriginalOrder.length
        ? [...state.queueOriginalOrder]
        : [...state.queue];
      const restoredIndex = Math.max(
        0,
        findTrackIndex(restoredQueue, currentTrack)
      );
      set({
        queue: restoredQueue,
        queueIndex: restoredIndex,
        isShuffle: false,
      });
    } else {
      const remainingTracks = state.queue.filter(
        (_, index) => index !== state.queueIndex
      );
      set({
        queue: [currentTrack, ...shuffleTracks(remainingTracks)],
        queueOriginalOrder: [...state.queue],
        queueIndex: 0,
        isShuffle: true,
      });
    }
    warmQueueNeighbors(get().queue, get().queueIndex);
  },

  setRepeatMode: (mode: RepeatMode) => {
    set({ repeatMode: mode });
  },

  closePlayer: async () => {
    await unload();
    set({
      currentTrack: null,
      isPlayerVisible: false,
      isFullPlayerVisible: false,
      lyricsData: null,
      queueSourceId: null,
      playerState: DEFAULT_STATE,
    });
  },

  refreshLyrics: async () => {
    const { currentTrack, activeRequestId } = get();
    if (!currentTrack) return;
    set({ isLoadingLyrics: true });

    const lyrics = await fetchLyrics(
      currentTrack.title,
      currentTrack.artistName,
      currentTrack.duration_ms ? currentTrack.duration_ms / 1000 : undefined,
      currentTrack.albumName
    );

    if (get().activeRequestId === activeRequestId) {
      if (get().lyricsData?.source === 'user') {
        set({ isLoadingLyrics: false });
        return;
      }
      const cacheKey = getCacheKey(currentTrack);
      if (lyrics) {
        lyricsCache.set(getLyricsCacheKey(currentTrack), lyrics);
        AsyncStorage.setItem(
          `${STORAGE_LYRICS_PREFIX}${cacheKey}`,
          JSON.stringify(lyrics)
        ).catch(() => {});
      }
      set({
        lyricsData: lyrics,
        isLoadingLyrics: false,
      });
    }
  },

  updateLyricsSegments: async (segments: LyricSegment[]) => {
    const { currentTrack, lyricsData, activeRequestId } = get();
    if (!currentTrack || !segments.length || segments.some((segment) =>
      !segment.text.trim() || !Number.isFinite(segment.startTimeMs) ||
      !Number.isFinite(segment.endTimeMs) || segment.startTimeMs < 0 ||
      segment.endTimeMs <= segment.startTimeMs
    )) return false;

    const normalizedSegments = normalizeLyricSegments(segments);
    const updatedLyrics: LyricsData = {
      ...lyricsData,
      trackName: currentTrack.title,
      artistName: currentTrack.artistName,
      plainLyrics: normalizedSegments.map((segment) => segment.text).join('\n'),
      syncedLyrics: undefined,
      source: 'user',
      isSynced: true,
      segments: normalizedSegments,
    };
    const cacheKey = getCacheKey(currentTrack);
    lyricsCache.set(getLyricsCacheKey(currentTrack), updatedLyrics);
    set({ lyricsData: updatedLyrics, isLoadingLyrics: false });

    try {
      await AsyncStorage.setItem(
        `${STORAGE_LYRICS_PREFIX}${cacheKey}`,
        JSON.stringify(updatedLyrics)
      );
      const offlineCopy = await saveLyricsOffline(
        currentTrack.spotifyId,
        updatedLyrics
      );
      if (!offlineCopy) {
        console.warn('[PlayerStore] Could not save offline lyric copy.');
      }
      return true;
    } catch (error) {
      console.warn('[PlayerStore] Could not save edited lyrics:', error);
      if (get().activeRequestId === activeRequestId && get().lyricsData === updatedLyrics) {
        set({ lyricsData });
      }
      const lyricsCacheKey = getLyricsCacheKey(currentTrack);
      if (lyricsCache.get(lyricsCacheKey) === updatedLyrics) {
        if (lyricsData) lyricsCache.set(lyricsCacheKey, lyricsData);
        else lyricsCache.delete(lyricsCacheKey);
      }
      return false;
    }
  },
}));

setRemotePlaybackHandlers({
  next: () => usePlayerStore.getState().playNext(),
  previous: () => usePlayerStore.getState().playPrevious(),
});

let previousStreamingQuality = getCachedAppSettings().streamingQuality;
let previousPreloading = getCachedAppSettings().preloadNextTrack;
subscribeAppSettings((settings) => {
  const changed = settings.streamingQuality !== previousStreamingQuality ||
    settings.preloadNextTrack !== previousPreloading;
  previousStreamingQuality = settings.streamingQuality;
  previousPreloading = settings.preloadNextTrack;
  if (!changed) return;
  queuePreloadKeys.clear();
  warmedAudioSources.forEach(({ source }) => releasePreloadedAudio(source));
  warmedAudioSources.clear();
  preparedNativeAudio.clear();
  if (settings.preloadNextTrack) {
    const { queue, queueIndex } = usePlayerStore.getState();
    warmQueueNeighbors(queue, queueIndex);
  }
});
