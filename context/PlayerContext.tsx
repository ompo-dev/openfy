/**
 * PlayerContext
 * Forwarding layer providing backward compatibility for components using `usePlayer()`,
 * backed by the high-performance Zustand `usePlayerStore`.
 */

import * as React from 'react';
import { AppState } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore, type PlayerStoreState } from '../stores/usePlayerStore';
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

const selectPlayer = (state: PlayerStoreState) => state;

// Screens that only need commands or play/pause state must not subscribe to
// the playback clock. The default remains available for timed player views.
export const usePlayer = <T = PlayerStoreState,>(
  selector: (state: PlayerStoreState) => T = selectPlayer as (state: PlayerStoreState) => T
): T => usePlayerStore(useShallow(selector));

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
