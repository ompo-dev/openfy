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
  getPlayableAudioUrl,
  resolveAudioUrl,
  downloadTrack,
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
  localAudioPath?: string;
  streamUrl?: string;
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
const streamCache = new Map<string, string>();
const lyricsCache = new Map<string, LyricsData>();

// Existing entries were created by native fallback providers. Start new caches
// on canonical backend so iPhone cannot reuse a different song or expired URL.
const STREAM_CACHE_VERSION = 'v2';
const STORAGE_STREAM_PREFIX = `openfy_stream_cache_${STREAM_CACHE_VERSION}_`;
const LYRICS_CACHE_VERSION = 'v7';
const STORAGE_LYRICS_PREFIX = `openfy_lyrics_cache_${LYRICS_CACHE_VERSION}_`;

const IS_SPOTIFY_ID = /^[a-zA-Z0-9]{22}$/;

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

    // 1. ATOMIC GENERATION LOCK 🔒: Increments request counter to cancel any stale in-flight fetches
    const requestId = get().activeRequestId + 1;
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
        ? { queue: [track], queueIndex: 0, queueSourceId: null }
        : {}),
    });

    // Record interaction metric
    recordInteraction(track, 'play').catch(() => {});

    // 2. CONCURRENT AUDIO STREAM RESOLUTION & PERSISTENT CACHE
    const resolveAudioPromise = (async (): Promise<string | null> => {
      // Check track direct fields
      if (track.localAudioPath && !track.localAudioPath.endsWith('.m3u8')) {
        try {
          const info = await FileSystem.getInfoAsync(track.localAudioPath);
          if (info.exists && (!info.size || info.size > 5000)) {
            return track.localAudioPath;
          }
        } catch {}
      }

      if (track.streamUrl && track.streamUrl.startsWith('http')) {
        return getPlayableAudioUrl(track.streamUrl);
      }

      // Check Memory Cache
      if (streamCache.has(cacheKey)) {
        return getPlayableAudioUrl(streamCache.get(cacheKey)!);
      }

      // Check Persistent AsyncStorage Cache
      try {
        const stored = await AsyncStorage.getItem(
          `${STORAGE_STREAM_PREFIX}${cacheKey}`
        );
        if (stored) {
          const playableUrl = getPlayableAudioUrl(stored);
          streamCache.set(cacheKey, playableUrl);
          if (playableUrl !== stored) {
            AsyncStorage.setItem(
              `${STORAGE_STREAM_PREFIX}${cacheKey}`,
              playableUrl
            ).catch(() => {});
          }
          return playableUrl;
        }
      } catch {}

      // Resolve via Backend / Resolver
      const resolved = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );

      if (resolved?.url) {
        streamCache.set(cacheKey, resolved.url);
        AsyncStorage.setItem(
          `${STORAGE_STREAM_PREFIX}${cacheKey}`,
          resolved.url
        ).catch(() => {});
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
        track.duration_ms ? track.duration_ms / 1000 : undefined
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
      return;
    }

    console.log(`[PlayerStore #${requestId}] Playing stream:`, streamUri);

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
    });

    if (get().activeRequestId !== requestId) return;

    if (success) {
      set((state) => ({
        isLoadingAudio: false,
        history: [track, ...state.history.slice(0, 49)],
      }));

      // Background download cache for offline listening
      if (track.spotifyId && !track.localAudioPath && streamUri) {
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
        streamCache.set(cacheKey, fallbackResolved.url);
        await loadAndPlay(fallbackResolved.url, handleStatusUpdate, {
          title: track.title,
          artist: track.artistName,
          albumTitle: track.albumName,
          artworkUrl: track.imageURL,
        });
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
      currentTrack.duration_ms ? currentTrack.duration_ms / 1000 : undefined
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
