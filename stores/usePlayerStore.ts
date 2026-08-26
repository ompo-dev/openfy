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
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  loadAndPlay,
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
  fadeOutCurrent,
  restoreCurrentVolume,
  preloadAudio,
  releasePreloadedAudio,
  recordInteraction,
} from '@services';
import {
  fetchLyrics,
  LyricsData,
  LyricSegment,
  saveLyricsOffline,
} from '../services/lyrics/lyricsService';
import { normalizeLyricSegments } from '../services/lyrics/lyricTimeline';

export type PlayerTrack = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  releaseDate?: string;
  localAudioPath?: string;
  streamUrl?: string;
  streamExpiresAt?: number;
  duration_ms: number;
  youtubeUrl?: string;
  artists?: { id: string; name: string }[];
};

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayerStoreState {
  // Current playback
  currentTrack: PlayerTrack | null;
  playerState: PlayerState;
  isPlayerVisible: boolean;
  isLoadingAudio: boolean;
  isLoadingLyrics: boolean;
  lyricsData: LyricsData | null;

  // Queue & Navigation
  queue: PlayerTrack[];
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
    sourceId?: string
  ) => Promise<void>;
  playDownloadedTrack: (track: any) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekToPosition: (ms: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  addToQueue: (tracks: PlayerTrack[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setIsPlayerVisible: (visible: boolean) => void;
  closePlayer: () => Promise<void>;
  refreshLyrics: () => Promise<void>;
  updateLyricsSegments: (segments: LyricSegment[]) => Promise<boolean>;
}

// In-Memory Fast Caches
const lyricsCache = new Map<string, LyricsData>();

// Existing entries were created by native fallback providers. Start new caches
// on canonical backend so iPhone cannot reuse a different song or expired URL.
const LYRICS_CACHE_VERSION = 'v9';
const STORAGE_LYRICS_PREFIX = `openfy_lyrics_cache_${LYRICS_CACHE_VERSION}_`;
const AUDIO_SOURCE_TTL_MS = 10 * 60_000;
const MIN_PRELOADED_SOURCE_LIFETIME_MS = 5_000;

const IS_SPOTIFY_ID = /^[a-zA-Z0-9]{22}$/;
const warmedAudioSources = new Map<string, { uri: string; expiresAt: number }>();
const activeAudioWarmups = new Map<string, Promise<void>>();
const queuePreloadKeys = new Set<string>();

// Helper: Normalize cache key to prevent cross-song cache collisions
const getCacheKey = (track: PlayerTrack) => {
  if (track.spotifyId && IS_SPOTIFY_ID.test(track.spotifyId)) {
    return track.spotifyId;
  }
  const cleanTitle = (track.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  const cleanArtist = (track.artistName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  return `${cleanArtist}_${cleanTitle}`;
};

const getLyricsCacheKey = (track: PlayerTrack) =>
  `${getCacheKey(track)}:${LYRICS_CACHE_VERSION}`;

export const getExistingLocalAudioPath = async (path?: string): Promise<string | null> => {
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
  track?: (Partial<PlayerTrack> & { audioUrl?: string }) | null
): Promise<string | null> => {
  if (!track) return null;

  const localPath = await getExistingLocalAudioPath(track.localAudioPath);
  if (localPath) return localPath;

  if (Platform.OS !== 'web') return null;

  const webSource = track.streamUrl || track.audioUrl || track.localAudioPath;
  if (
    !webSource ||
    webSource.endsWith('.m3u8') ||
    !/^(https?:|blob:)/i.test(webSource)
  ) {
    return null;
  }

  return getPlayableAudioUrl(webSource);
};

const getFreshPreloadedSource = (track: PlayerTrack): string | null => {
  const now = Date.now();
  if (
    track.streamUrl &&
    (Platform.OS === 'web' ||
      (track.streamExpiresAt || 0) > now + MIN_PRELOADED_SOURCE_LIFETIME_MS)
  ) {
    return track.streamUrl;
  }

  const warmed = warmedAudioSources.get(getCacheKey(track));
  return warmed && warmed.expiresAt > now + MIN_PRELOADED_SOURCE_LIFETIME_MS
    ? warmed.uri
    : null;
};

const cacheAudioSource = (track: PlayerTrack, uri: string) => {
  warmedAudioSources.set(getCacheKey(track), {
    uri,
    expiresAt: Date.now() + AUDIO_SOURCE_TTL_MS,
  });
};

const warmTrackAudio = (
  track?: PlayerTrack,
  isStillNeeded: () => boolean = () => true
) => {
  if (!track) return;
  if (!isStillNeeded()) return;
  const cacheKey = getCacheKey(track);
  const suppliedSource = getFreshPreloadedSource(track);
  if (suppliedSource) {
    if (isStillNeeded()) void preloadAudio(suppliedSource);
    return;
  }
  if (activeAudioWarmups.has(cacheKey)) return;

  const warmup = (async () => {
    const directSavedSource = await getSavedAudioSource(track);
    if (directSavedSource) {
      cacheAudioSource(track, directSavedSource);
      if (isStillNeeded()) void preloadAudio(directSavedSource);
      return;
    }

    const downloaded = await getDownloadedTrack(track.spotifyId);
    const downloadedSavedSource = await getSavedAudioSource(downloaded);
    if (downloadedSavedSource) {
      cacheAudioSource(track, downloadedSavedSource);
      if (isStillNeeded()) void preloadAudio(downloadedSavedSource);
      return;
    }

    if (getFreshPreloadedSource(track)) return;
    const resolved = await resolveAudioUrl(
      track.title,
      track.artistName,
      track.spotifyId,
      track.duration_ms,
      track.releaseDate
    );
    if (resolved?.url && isStillNeeded()) {
      cacheAudioSource(track, resolved.url);
      void preloadAudio(resolved.url);
    }
  })()
    .catch(() => {})
    .finally(() => activeAudioWarmups.delete(cacheKey));

  activeAudioWarmups.set(cacheKey, warmup);
};

const warmQueueNeighbors = (queue: PlayerTrack[], queueIndex: number) => {
  const currentTrack = queue[queueIndex];
  const neighbors = [queue[queueIndex - 1], queue[queueIndex + 1]].filter(
    (track): track is PlayerTrack => Boolean(track)
  );
  const retainedKeys = new Set(
    [currentTrack, ...neighbors].filter(Boolean).map(getCacheKey)
  );

  queuePreloadKeys.clear();
  neighbors.forEach((track) => queuePreloadKeys.add(getCacheKey(track)));

  warmedAudioSources.forEach(({ uri }, cacheKey) => {
    if (!retainedKeys.has(cacheKey)) {
      warmedAudioSources.delete(cacheKey);
      releasePreloadedAudio(uri);
    }
  });

  neighbors.forEach((track) =>
    warmTrackAudio(track, () => queuePreloadKeys.has(getCacheKey(track)))
  );
};

export const usePlayerStore = create<PlayerStoreState>((set, get) => ({
  currentTrack: null,
  playerState: DEFAULT_STATE,
  isPlayerVisible: false,
  isLoadingAudio: false,
  isLoadingLyrics: false,
  lyricsData: null,
  queue: [],
  queueIndex: 0,
  queueSourceId: null,
  history: [],
  isShuffle: false,
  repeatMode: 'off',
  activeRequestId: 0,

  setIsPlayerVisible: (visible: boolean) => {
    set({ isPlayerVisible: visible });
  },

  playTrack: async (track: PlayerTrack, options = {}) => {
    // A direct selection is a new one-track session. Queue navigation paths
    // explicitly preserve their queue below so the controls never point at
    // tracks selected previously on another screen.
    const { showPlayer = true, setQueue = true } = options;
    let hasSavedWebDownload = false;

    // 1. ATOMIC GENERATION LOCK 🔒: Increments request counter to cancel any stale in-flight fetches
    const requestId = get().activeRequestId + 1;
    const cacheKey = getCacheKey(track);
    const lyricsCacheKey = getLyricsCacheKey(track);
    const fadeOutPromise = getStatus().isPlaying
      ? fadeOutCurrent()
      : Promise.resolve();

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
        ? { queue: [track], queueIndex: 0, queueSourceId: null }
        : {}),
    });
    warmQueueNeighbors(get().queue, get().queueIndex);

    // Record interaction metric
    recordInteraction(track, 'play').catch(() => {});

    // 2. CONCURRENT AUDIO STREAM RESOLUTION & PERSISTENT CACHE
    const resolveAudioPromise = (async (): Promise<string | null> => {
      const directSavedSource = await getSavedAudioSource(track);
      if (directSavedSource) {
        cacheAudioSource(track, directSavedSource);
        hasSavedWebDownload = Platform.OS === 'web';
        return directSavedSource;
      }

      // Screens normally know only a Spotify id. Resolve that id against the
      // download registry here so every caller gets offline playback.
      const downloaded = await getDownloadedTrack(track.spotifyId);
      const downloadedSavedSource = await getSavedAudioSource(downloaded);
      if (downloadedSavedSource) {
        cacheAudioSource(track, downloadedSavedSource);
        hasSavedWebDownload = Platform.OS === 'web';
        return downloadedSavedSource;
      }

      const preloadedSource = getFreshPreloadedSource(track);
      if (preloadedSource) {
        cacheAudioSource(track, preloadedSource);
        return preloadedSource;
      }

      const activeWarmup = activeAudioWarmups.get(cacheKey);
      if (activeWarmup) {
        await activeWarmup;
        const warmedSource = getFreshPreloadedSource(track);
        if (warmedSource) return warmedSource;
      }

      const resolved = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );

      if (resolved?.url) {
        cacheAudioSource(track, resolved.url);
        return resolved.url;
      }

      return null;
    })();

    // 3. CONCURRENT LYRICS RESOLUTION & PERSISTENT CACHE
    const resolveLyricsPromise = (async (): Promise<LyricsData | null> => {
      if (cachedLyrics) return cachedLyrics;

      try {
        const stored = await AsyncStorage.getItem(
          `${STORAGE_LYRICS_PREFIX}${cacheKey}`
        );
        if (stored) {
          const parsed = JSON.parse(stored) as LyricsData;
          lyricsCache.set(lyricsCacheKey, parsed);
          return parsed;
        }
      } catch {}

      const fetched = await fetchLyrics(
        track.title,
        track.artistName,
        track.duration_ms ? track.duration_ms / 1000 : undefined,
        track.albumName
      );

      if (fetched) {
        lyricsCache.set(lyricsCacheKey, fetched);
        AsyncStorage.setItem(
          `${STORAGE_LYRICS_PREFIX}${cacheKey}`,
          JSON.stringify(fetched)
        ).catch(() => {});
        return fetched;
      }

      return null;
    })();

    // Execute Lyrics resolution and update store if generation lock matches
    resolveLyricsPromise.then((lyrics) => {
      if (get().activeRequestId === requestId) {
        set({
          lyricsData: lyrics,
          isLoadingLyrics: false,
        });
      }
    });

    // Execute Audio resolution
    const streamUri = await resolveAudioPromise;

    // RACE CONDITION CHECK: Discard if user clicked another track in the meantime
    if (get().activeRequestId !== requestId) {
      console.log(
        `[PlayerStore #${requestId}] Discarding stale playback response for "${track.title}"`
      );
      return;
    }

    if (!streamUri) {
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
      if (get().activeRequestId === requestId) {
        await restoreCurrentVolume();
      }
      return;
    }

    console.log(`[PlayerStore #${requestId}] Playing stream:`, streamUri);
    await fadeOutPromise;

    if (get().activeRequestId !== requestId) return;

    // Audio status update handler
    const handleStatusUpdate = (state: PlayerState) => {
      // Only process updates if this track is still the active one
      if (get().activeRequestId !== requestId) return;

      const currentDuration = state.durationMs || track.duration_ms || 0;
      set({
        isLoadingAudio: false,
        playerState: {
          ...state,
          durationMs: currentDuration,
        },
      });

      // Auto-advance detection on track finish
      if (
        state.isLoaded &&
        !state.isPlaying &&
        state.positionMs > 0 &&
        currentDuration > 0 &&
        state.positionMs >= currentDuration - 500
      ) {
        const repeat = get().repeatMode;
        if (repeat === 'one') {
          seekTo(0);
          play();
        } else {
          get().playNext();
        }
      }
    };

    const success = await loadAndPlay(streamUri, handleStatusUpdate, {
      title: track.title,
      artist: track.artistName,
      albumTitle: track.albumName,
      artworkUrl: track.imageURL,
    }, 2000);

    if (get().activeRequestId !== requestId) return;

    if (success) {
      set((state) => ({
        isLoadingAudio: false,
        history: [track, ...state.history.slice(0, 49)],
      }));

      // Background download cache for offline listening
      if (
        track.spotifyId &&
        !streamUri.startsWith('file:') &&
        !hasSavedWebDownload
      ) {
        const isMp3 = streamUri.includes('.mp3') || !streamUri.includes('.m4a');
        downloadTrack(
          {
            spotifyId: track.spotifyId,
            title: track.title,
            artistName: track.artistName,
            albumName: track.albumName,
            imageURL: track.imageURL,
            duration_ms: track.duration_ms,
          },
          streamUri,
          isMp3 ? 'mp3' : 'm4a'
        ).catch(() => {});
      }
    } else {
      console.warn(
        `[PlayerStore #${requestId}] Initial playback failed, retrying fresh resolution...`
      );
      const fallbackResolved = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );
      if (get().activeRequestId === requestId && fallbackResolved?.url) {
        await loadAndPlay(fallbackResolved.url, handleStatusUpdate, {
          title: track.title,
          artist: track.artistName,
          albumTitle: track.albumName,
          artworkUrl: track.imageURL,
        }, 2000);
      }
    }
  },

  playWithQueue: async (tracks: PlayerTrack[], startIndex = 0, sourceId) => {
    if (!tracks || tracks.length === 0) return;
    const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
    set({
      queue: tracks,
      queueIndex: safeIndex,
      queueSourceId: sourceId ?? null,
    });
    await get().playTrack(tracks[safeIndex], { setQueue: false });
  },

  playDownloadedTrack: async (downloaded: any) => {
    const playerTrack: PlayerTrack = {
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

  togglePlayPause: async () => {
    const { currentTrack, playTrack } = get();

    // Always read real-time state from playerService (not Zustand state which can be stale)
    // This ensures pause works from any screen: banners, carrossel, etc.
    const realState = getStatus();

    if (!realState.isLoaded && currentTrack) {
      await playTrack(currentTrack, { setQueue: false });
      return;
    }

    if (realState.isPlaying) {
      await pause();
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

  playNext: async () => {
    const { queue, queueIndex, isShuffle, repeatMode, playTrack } = get();
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;
    if (isShuffle && queue.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * queue.length);
      } while (nextIndex === queueIndex);
    } else if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        return; // End of queue
      }
    }

    set({ queueIndex: nextIndex });
    await playTrack(queue[nextIndex], { setQueue: false });
  },

  playPrevious: async () => {
    const { queue, queueIndex, playerState, repeatMode, playTrack } = get();
    if (queue.length === 0) return;

    // If already playing for more than 3 seconds, restart current track
    if (playerState.positionMs > 3000) {
      await seekTo(0);
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      if (repeatMode !== 'all') return;
      prevIndex = queue.length - 1;
    }

    set({ queueIndex: prevIndex });
    await playTrack(queue[prevIndex], { setQueue: false });
  },

  addToQueue: (tracks: PlayerTrack[]) => {
    set((state) => ({
      queue: [...state.queue, ...tracks],
    }));
  },

  removeFromQueue: (index: number) => {
    set((state) => {
      const newQueue = [...state.queue];
      newQueue.splice(index, 1);
      const newIndex =
        state.queueIndex >= newQueue.length
          ? Math.max(0, newQueue.length - 1)
          : state.queueIndex;
      return {
        queue: newQueue,
        queueIndex: newIndex,
      };
    });
  },

  clearQueue: () => {
    set({
      queue: [],
      queueIndex: 0,
      queueSourceId: null,
    });
  },

  toggleShuffle: () => {
    set((state) => ({ isShuffle: !state.isShuffle }));
  },

  setRepeatMode: (mode: RepeatMode) => {
    set({ repeatMode: mode });
  },

  closePlayer: async () => {
    await unload();
    set({
      currentTrack: null,
      isPlayerVisible: false,
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
    if (!currentTrack || !lyricsData) return false;

    const updatedLyrics: LyricsData = {
      ...lyricsData,
      isSynced: true,
      segments: normalizeLyricSegments(segments),
    };
    const cacheKey = getCacheKey(currentTrack);
    lyricsCache.set(getLyricsCacheKey(currentTrack), updatedLyrics);
    set({ lyricsData: updatedLyrics });

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
      if (get().activeRequestId === activeRequestId) {
        set({ lyricsData });
        lyricsCache.set(getLyricsCacheKey(currentTrack), lyricsData);
      }
      return false;
    }
  },
}));
