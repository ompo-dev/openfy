/**
 * PlayerContext
 * Forwarding layer providing backward compatibility for components using `usePlayer()`,
 * backed by the high-performance Zustand `usePlayerStore`.
 */

import * as React from 'react';
import { AppState } from 'react-native';
import { usePlayerStore, PlayerTrack } from '../stores/usePlayerStore';
import {
  clampPlaybackPositionMs,
  getAudioDiagnosticsSnapshot,
  getStatus,
  reconcilePlaybackDurationMs,
  recordAudioDiagnostic,
  releaseAllPreloadedAudio,
} from '@services';
import { log } from '../utils/appLogger';

const PLAYER_STATUS_SYNC_INTERVAL_MS = 500;
const PLAYER_POSITION_SYNC_THRESHOLD_MS = 250;

export { PlayerTrack } from '../stores/usePlayerStore';

export const usePlayer = () => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const queueSourceId = usePlayerStore((s) => s.queueSourceId);
  const playerState = usePlayerStore((s) => s.playerState);
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  const lyricsData = usePlayerStore((s) => s.lyricsData);
  const isLoadingLyrics = usePlayerStore((s) => s.isLoadingLyrics);
  const isLoadingAudio = usePlayerStore((s) => s.isLoadingAudio);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const playWithQueue = usePlayerStore((s) => s.playWithQueue);
  const playDownloadedTrack = usePlayerStore((s) => s.playDownloadedTrack);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const seekToPosition = usePlayerStore((s) => s.seekToPosition);
  const playQueueIndex = usePlayerStore((s) => s.playQueueIndex);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode);
  const closePlayer = usePlayerStore((s) => s.closePlayer);
  const refreshLyrics = usePlayerStore((s) => s.refreshLyrics);
  const updateLyricsSegments = usePlayerStore((s) => s.updateLyricsSegments);

  return {
    currentTrack,
    queue,
    queueIndex,
    queueSourceId,
    playerState,
    isPlayerVisible,
    lyricsData,
    isLoadingLyrics,
    isLoadingAudio,
    isShuffle,
    repeatMode,
    playTrack,
    playWithQueue,
    playDownloadedTrack,
    togglePlayPause,
    seekToPosition,
    playQueueIndex,
    playNext,
    playPrevious,
    addToQueue,
    clearQueue,
    toggleShuffle,
    setRepeatMode,
    closePlayer,
    refreshLyrics,
    updateLyricsSegments,
  };
};

export const PlayerProvider = ({ children }: { children: React.ReactNode }) => {
  React.useEffect(() => {
    const syncVisiblePlaybackState = () => {
      const snapshot = usePlayerStore.getState();
      if (!snapshot.currentTrack || snapshot.isLoadingAudio) return;

      const liveState = getStatus();
      if (!liveState.isLoaded && !liveState.isPlaying) return;

      const durationMs = reconcilePlaybackDurationMs(
        liveState.durationMs,
        snapshot.currentTrack.duration_ms
      );
      const positionMs = clampPlaybackPositionMs(
        liveState.positionMs,
        durationMs
      );
      const previous = snapshot.playerState;
      const positionDriftMs = Math.abs(previous.positionMs - positionMs);
      const statusChanged =
        previous.isPlaying !== liveState.isPlaying ||
        previous.isBuffering !== liveState.isBuffering ||
        previous.isLoaded !== liveState.isLoaded;
      if (!statusChanged && positionDriftMs < PLAYER_POSITION_SYNC_THRESHOLD_MS) {
        return;
      }

      usePlayerStore.setState({
        isLoadingAudio: false,
        playerState: { ...liveState, durationMs, positionMs },
      });
      if (statusChanged || positionDriftMs >= 1000) {
        log.player('visible player status reconciled', {
          trackId: snapshot.currentTrack.spotifyId,
          statusChanged,
          positionDriftMs,
        });
      }
    };

    const syncIfActive = () => {
      if (
        AppState.currentState !== 'background' &&
        AppState.currentState !== 'inactive'
      ) {
        syncVisiblePlaybackState();
      }
    };
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        recordAudioDiagnostic('app-state', state);
        if (state === 'active') syncVisiblePlaybackState();
        if (state !== 'active') {
          console.log('[PlayerDiagnostics] App state changed:', {
            state,
            recentAudio: getAudioDiagnosticsSnapshot(),
          });
        }
      }
    );
    const memorySubscription = AppState.addEventListener(
      'memoryWarning',
      () => {
        releaseAllPreloadedAudio();
        recordAudioDiagnostic('memory-warning');
        console.warn('[PlayerDiagnostics] Memory warning during playback:', {
          recentAudio: getAudioDiagnosticsSnapshot(),
        });
      }
    );
    const statusTimer = setInterval(
      syncIfActive,
      PLAYER_STATUS_SYNC_INTERVAL_MS
    );

    return () => {
      clearInterval(statusTimer);
      appStateSubscription.remove();
      memorySubscription.remove();
    };
  }, []);

  return <>{children}</>;
};
