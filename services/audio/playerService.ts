/**
 * PlayerService — Expo Audio SDK 57
 * Uses AudioModule from expo-audio (replaces deprecated expo-av).
 * Supports streaming HLS, local files, and progressive mp3/m4a playback.
 */
import {
  AudioModule,
  setAudioModeAsync,
  type AudioStatus,
} from 'expo-audio';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';

export type PlayerState = {
  isPlaying: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  positionMs: number;
  durationMs: number;
  error?: string;
};

export const DEFAULT_STATE: PlayerState = {
  isPlaying: false,
  isBuffering: false,
  isLoaded: false,
  positionMs: 0,
  durationMs: 0,
};

let playerInstance: AudioPlayer | null = null;
let statusCallback: ((state: PlayerState) => void) | null = null;
let isSeeking = false;

const toState = (status: AudioStatus): PlayerState => ({
  isPlaying: status.playing ?? false,
  isBuffering: status.isBuffering ?? false,
  isLoaded: status.isLoaded ?? false,
  positionMs: (status.currentTime ?? 0) * 1000,
  durationMs: (status.duration ?? 0) * 1000,
});

/**
 * Configure audio session for background music playback.
 */
export const configureAudioSession = async (): Promise<void> => {
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  } catch {
    // ignore config errors
  }
};

/**
 * Load and play an audio URI (local file or remote stream).
 */
export const loadAndPlay = async (
  uri: string,
  onStatusUpdate?: (state: PlayerState) => void
): Promise<boolean> => {
  try {
    // Unload existing player
    if (playerInstance) {
      try {
        playerInstance.remove();
      } catch {}
      playerInstance = null;
    }

    statusCallback = onStatusUpdate || null;
    await configureAudioSession();

    console.log('[PlayerService] Loading audio source:', uri);

    const player = new AudioModule.AudioPlayer(uri, 100, true, 20);
    playerInstance = player;

    player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      const state = toState(status);
      statusCallback?.(state);
    });

    player.play();
    return true;
  } catch (error) {
    console.error('[PlayerService] Failed to load audio:', error, 'URI:', uri);
    statusCallback?.({ ...DEFAULT_STATE, error: String(error) });
    return false;
  }
};

/**
 * Play / resume playback.
 */
export const play = async (): Promise<void> => {
  if (!playerInstance) return;
  try {
    await configureAudioSession();
    playerInstance.play();
  } catch (error) {
    console.error('[PlayerService] play error:', error);
  }
};

/**
 * Pause playback.
 */
export const pause = async (): Promise<void> => {
  if (!playerInstance) return;
  try {
    playerInstance.pause();
  } catch (error) {
    console.error('[PlayerService] pause error:', error);
  }
};

/**
 * Seek to position in milliseconds.
 */
export const seekTo = async (positionMs: number): Promise<void> => {
  if (!playerInstance || isSeeking) return;
  isSeeking = true;
  try {
    const targetSec = Math.max(0, positionMs / 1000);
    await playerInstance.seekTo(targetSec);
  } catch {
    // suppress rapid seek interruptions
  } finally {
    isSeeking = false;
  }
};

/**
 * Stop and unload the current player.
 */
export const unload = async (): Promise<void> => {
  if (!playerInstance) return;
  try {
    playerInstance.remove();
    playerInstance = null;
  } catch (error) {
    console.error('[PlayerService] unload error:', error);
  }
};

/**
 * Get current playback state.
 */
export const getStatus = (): PlayerState => {
  if (!playerInstance) return DEFAULT_STATE;
  try {
    return {
      isPlaying: playerInstance.playing,
      isBuffering: playerInstance.isBuffering,
      isLoaded: playerInstance.isLoaded,
      positionMs: playerInstance.currentTime * 1000,
      durationMs: playerInstance.duration * 1000,
    };
  } catch {
    return DEFAULT_STATE;
  }
};
