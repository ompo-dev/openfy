/**
 * PlayerService — Expo Audio SDK 57
 * Uses createAudioPlayer from expo-audio (official SDK 57 API).
 * Supports streaming HLS, local files, and progressive mp3/m4a playback.
 */
import {
  clearPreloadedSource,
  createAudioPlayer,
  preload,
  setAudioModeAsync,
  type AudioStatus,
} from 'expo-audio';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';
import { AppState, Platform } from 'react-native';
import { recordDownloadDiagnostic } from '../download/downloadDiagnostics';
import { getDirectYouTubeMediaHeaders } from './directYouTubeResolver';
import { prepareLocalAudioForPlayback } from './localAudioRepair';
import {
  addNativeYouTubePlaybackListener,
  getNativeYouTubePlaybackStatus,
  parseNativeYouTubePlaybackUri,
  pauseNativeYouTubePlayback,
  playYouTubeVideoNatively,
  resumeNativeYouTubePlayback,
  seekNativeYouTubePlayback,
  stopNativeYouTubePlayback,
} from './nativeYouTubeTransfer';

export type AudioSourceInput =
  | string
  | { uri: string; headers?: Record<string, string> };

export type LockScreenMetadata = {
  title: string;
  artist: string;
  albumTitle?: string;
  artworkUrl?: string;
};

export type PlayerState = {
  isPlaying: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  positionMs: number;
  durationMs: number;
  didJustFinish?: boolean;
  mediaServicesDidReset?: boolean;
  playbackState?: string;
  reasonForWaitingToPlay?: string;
  timeControlStatus?: string;
  error?: string;
};

export type PlaybackDiagnosticTrack = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  duration_ms?: number;
};

export type RemotePlaybackHandlers = {
  next?: () => void | Promise<void>;
  previous?: () => void | Promise<void>;
};

export type AudioDiagnosticEvent = {
  at: string;
  event: string;
  state: PlayerState;
  sourceKind: 'local' | 'remote' | 'web' | 'none';
  sourceHost?: string;
  note?: string;
};

export const DEFAULT_STATE: PlayerState = {
  isPlaying: false,
  isBuffering: false,
  isLoaded: false,
  positionMs: 0,
  durationMs: 0,
};

export const toAudioSource = (
  input: AudioSourceInput
): { uri: string; headers?: Record<string, string> } => {
  if (typeof input !== 'string') {
    if (!input.headers && input.uri) {
      const headers = getDirectYouTubeMediaHeaders(input.uri);
      return headers ? { uri: input.uri, headers } : input;
    }
    return input;
  }
  const headers = getDirectYouTubeMediaHeaders(input);
  return headers ? { uri: input, headers } : { uri: input };
};

export const getAudioSourceUri = (input: AudioSourceInput): string =>
  typeof input === 'string' ? input : input.uri;

let playerInstance: AudioPlayer | null = null;
let playerStatusSubscription: { remove(): void } | undefined;
let playerAppStateSubscription: { remove(): void } | undefined;
let playerRemoteNextSubscription: { remove(): void } | undefined;
let playerRemotePreviousSubscription: { remove(): void } | undefined;
let nativeYouTubeSubscriptions: { remove(): void }[] = [];
let nativeYouTubeStatusTimer: ReturnType<typeof setInterval> | undefined;
let nativeYouTubeActive = false;
let nativeYouTubeState: PlayerState = DEFAULT_STATE;
let nativeYouTubeStatusCallback: ((state: PlayerState) => void) | null = null;
let nativeStopPromise = Promise.resolve();
let loadGeneration = 0;
let isSeeking = false;
let remoteCommandInFlight = false;
let remotePlaybackHandlers: RemotePlaybackHandlers = {};
let currentSourceKind: AudioDiagnosticEvent['sourceKind'] = 'none';
let currentSourceHost: string | undefined;
let currentDiagnosticSpotifyId: string | null = null;
let lastDiagnosticSignature = '';
let volumeRamp: {
  timer: ReturnType<typeof setInterval>;
  resolve: () => void;
} | null = null;
const diagnostics: AudioDiagnosticEvent[] = [];
const MAX_DIAGNOSTICS = 30;

const getPlayerOptions = () =>
  Platform.OS === 'web'
    ? { updateInterval: 100 }
    : {
        updateInterval: 500,
        keepAudioSessionActive: true,
        preferredForwardBufferDuration: Platform.OS === 'ios' ? 30 : 10,
      };

const stopVolumeRamp = () => {
  if (!volumeRamp) return;
  clearInterval(volumeRamp.timer);
  volumeRamp.resolve();
  volumeRamp = null;
};

const rampPlayerVolume = (
  player: AudioPlayer,
  target: number,
  durationMs: number
): Promise<void> => {
  stopVolumeRamp();
  const start = Math.max(0, Math.min(1, player.volume ?? 1));
  const end = Math.max(0, Math.min(1, target));
  if (start === end || durationMs <= 0) {
    player.volume = end;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const complete = () => {
      if (volumeRamp?.resolve === complete) volumeRamp = null;
      resolve();
    };
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      player.volume = start + (end - start) * progress;
      if (progress === 1) {
        clearInterval(timer);
        complete();
      }
    }, 50);
    volumeRamp = { timer, resolve: complete };
  });
};

const toState = (status: AudioStatus): PlayerState => ({
  isPlaying: status.playing ?? false,
  isBuffering: status.isBuffering ?? false,
  isLoaded: status.isLoaded ?? false,
  positionMs: (status.currentTime ?? 0) * 1000,
  durationMs: (status.duration ?? 0) * 1000,
  didJustFinish: status.didJustFinish ?? false,
  mediaServicesDidReset: status.mediaServicesDidReset ?? false,
  playbackState: status.playbackState,
  reasonForWaitingToPlay: status.reasonForWaitingToPlay,
  timeControlStatus: status.timeControlStatus,
  // Propagate SDK error so the store can trigger transparent stream recovery.
  error: status.error ?? undefined,
});

const describeSource = (uri?: string): Pick<AudioDiagnosticEvent, 'sourceKind' | 'sourceHost'> => {
  if (!uri) return { sourceKind: 'none' };
  if (/^file:\/\//i.test(uri)) return { sourceKind: 'local' };
  if (Platform.OS === 'web') return { sourceKind: 'web' };
  try {
    return { sourceKind: 'remote', sourceHost: new URL(uri).hostname };
  } catch {
    return { sourceKind: 'remote' };
  }
};

const detachPlayerSubscriptions = () => {
  const status = playerStatusSubscription;
  const appState = playerAppStateSubscription;
  const remoteNext = playerRemoteNextSubscription;
  const remotePrevious = playerRemotePreviousSubscription;
  playerStatusSubscription = undefined;
  playerAppStateSubscription = undefined;
  playerRemoteNextSubscription = undefined;
  playerRemotePreviousSubscription = undefined;
  try { status?.remove(); } catch {}
  try { appState?.remove(); } catch {}
  try { remoteNext?.remove(); } catch {}
  try { remotePrevious?.remove(); } catch {}
};

const detachNativeYouTubeSubscriptions = () => {
  if (nativeYouTubeStatusTimer) clearInterval(nativeYouTubeStatusTimer);
  nativeYouTubeStatusTimer = undefined;
  nativeYouTubeSubscriptions.forEach((subscription) => {
    try { subscription.remove(); } catch {}
  });
  nativeYouTubeSubscriptions = [];
  nativeYouTubeStatusCallback = null;
  const appState = playerAppStateSubscription;
  playerAppStateSubscription = undefined;
  try { appState?.remove(); } catch {}
};

const stopNativeYouTubeEngine = (): Promise<void> => {
  const shouldStop = nativeYouTubeActive || nativeYouTubeSubscriptions.length > 0;
  nativeYouTubeActive = false;
  nativeYouTubeState = DEFAULT_STATE;
  detachNativeYouTubeSubscriptions();
  if (!shouldStop) return nativeStopPromise;
  nativeStopPromise = nativeStopPromise
    .catch(() => undefined)
    .then(() => stopNativeYouTubePlayback())
    .catch(() => undefined);
  return nativeStopPromise;
};

export const setRemotePlaybackHandlers = (
  handlers: RemotePlaybackHandlers
): void => {
  remotePlaybackHandlers = handlers;
};

const runRemoteCommand = (command: keyof RemotePlaybackHandlers): void => {
  const handler = remotePlaybackHandlers[command];
  if (!handler || remoteCommandInFlight) return;
  remoteCommandInFlight = true;
  void Promise.resolve(handler()).finally(() => {
    remoteCommandInFlight = false;
  });
};

/** Invalidate pending loads immediately when a different track is selected. */
export const beginTrackChange = (): void => {
  loadGeneration++;
  stopVolumeRamp();
  void stopNativeYouTubeEngine();
  // Silence the engine before touching listeners: a listener cleanup failure
  // must never orphan an audible player.
  try {
    playerInstance?.pause();
  } catch {
    disposeCurrentPlayer();
    return;
  }
  detachPlayerSubscriptions();
};

function disposeCurrentPlayer() {
  stopVolumeRamp();
  void stopNativeYouTubeEngine();
  const previous = playerInstance;
  try { previous?.pause(); } catch {}
  detachPlayerSubscriptions();
  try { previous?.clearLockScreenControls(); } catch {}
  try { previous?.remove(); } catch {}
  try { previous?.release(); } catch {}
  playerInstance = null;
}

const isAppActive = () =>
  Platform.OS === 'web' || !AppState?.currentState || AppState.currentState === 'active';

const playbackTransition = (state: PlayerState) => [
  state.isPlaying, state.isLoaded, state.isBuffering, state.didJustFinish,
  state.mediaServicesDidReset, state.error, state.playbackState,
  state.timeControlStatus, state.reasonForWaitingToPlay,
].join(':');

export const recordAudioDiagnostic = (event: string, note?: string): void => {
  const state = getPlayerState();
  diagnostics.push({
    at: new Date().toISOString(),
    event,
    state,
    sourceKind: currentSourceKind,
    sourceHost: currentSourceHost,
    note,
  });
  if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift();
  if (currentDiagnosticSpotifyId) {
    recordDownloadDiagnostic(currentDiagnosticSpotifyId, `player.${event}`, {
      note,
      state,
      sourceKind: currentSourceKind,
      sourceHost: currentSourceHost,
    });
  }
};

export const getAudioDiagnosticsSnapshot = (): AudioDiagnosticEvent[] =>
  diagnostics.slice();

const recordStatusDiagnostic = (state: PlayerState) => {
  if (!state.error && !state.mediaServicesDidReset && !state.isBuffering) {
    const transitionSignature = [
      state.isPlaying ? 'playing' : 'paused',
      state.isLoaded ? 'loaded' : 'unloaded',
      state.timeControlStatus || '',
      state.playbackState || '',
    ].join(':');
    if (transitionSignature === lastDiagnosticSignature) return;
    lastDiagnosticSignature = transitionSignature;
    const transition = {
      at: new Date().toISOString(),
      event: 'status-transition',
      state,
      sourceKind: currentSourceKind,
      sourceHost: currentSourceHost,
    };
    diagnostics.push(transition);
    if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift();
    if (currentDiagnosticSpotifyId) {
      recordDownloadDiagnostic(currentDiagnosticSpotifyId, 'player.status-transition', {
        state,
        sourceKind: currentSourceKind,
        sourceHost: currentSourceHost,
      });
    }
    return;
  }
  const signature = [
    state.error || '',
    state.mediaServicesDidReset ? 'media-reset' : '',
    state.isBuffering ? 'buffering' : '',
    state.timeControlStatus || '',
    state.playbackState || '',
  ].join(':');
  if (signature === lastDiagnosticSignature) return;
  lastDiagnosticSignature = signature;
  const event = state.error
    ? 'playback-error'
    : state.mediaServicesDidReset
      ? 'media-services-reset'
      : 'buffering';
  const diagnostic = {
    at: new Date().toISOString(),
    event,
    state,
    sourceKind: currentSourceKind,
    sourceHost: currentSourceHost,
  };
  diagnostics.push(diagnostic);
  if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift();
  if (currentDiagnosticSpotifyId) {
    recordDownloadDiagnostic(currentDiagnosticSpotifyId, `player.${event}`, {
      state,
      sourceKind: currentSourceKind,
      sourceHost: currentSourceHost,
    });
  }
};

/**
 * Configure audio session for background music playback.
 */
export const configureAudioSession = async (
  diagnosticSpotifyId = currentDiagnosticSpotifyId
): Promise<void> => {
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  } catch (error) {
    if (diagnosticSpotifyId) {
      recordDownloadDiagnostic(diagnosticSpotifyId, 'player.audio-session-config-failed', {
        error,
      });
    }
    throw error;
  }
};

/** Fade the active song without blocking its replacement source lookup. */
export const fadeOutCurrent = (durationMs = 2000): Promise<void> => {
  const player = playerInstance;
  return player ? rampPlayerVolume(player, 0, durationMs) : Promise.resolve();
};

/** Keep current song audible when a requested replacement cannot be loaded. */
export const restoreCurrentVolume = (): Promise<void> => {
  const player = playerInstance;
  return player ? rampPlayerVolume(player, 1, 180) : Promise.resolve();
};

/**
 * Tracks which sources have been preloaded, keyed by URI.
 * Storing the full AudioSourceInput ensures clearPreloadedSource receives
 * the same object that was passed to preload() (Expo SDK 57 requirement).
 */
type PreloadEntry = {
  source: AudioSourceInput;
  token: symbol;
  nativeReady: boolean;
  cancelled: boolean;
  operation: Promise<void>;
};

const preloadedSources = new Map<string, PreloadEntry>();
const preloadChains = new Map<string, Promise<void>>();
const MAX_PRELOADED_SOURCES = 3;

const clearPreloadedPayload = async (sourceInput: AudioSourceInput): Promise<void> => {
  try {
    const payload = typeof sourceInput === 'string' ? sourceInput : toAudioSource(sourceInput);
    await Promise.resolve(clearPreloadedSource(payload as any));
  } catch {}
};

const enqueuePreloadCleanup = (uri: string, sourceInput: AudioSourceInput): Promise<void> => {
  const previousForUri = preloadChains.get(uri) || Promise.resolve();
  const cleanup = previousForUri
    .catch(() => undefined)
    .then(() => clearPreloadedPayload(sourceInput))
    .finally(() => {
      if (preloadChains.get(uri) === cleanup) preloadChains.delete(uri);
    });
  preloadChains.set(uri, cleanup);
  return cleanup;
};

const trimPreloadedSources = () => {
  while (preloadedSources.size > MAX_PRELOADED_SOURCES) {
    const oldest = preloadedSources.entries().next().value as
      | [string, PreloadEntry]
      | undefined;
    if (!oldest) return;
    const [uri, sourceInput] = oldest;
    preloadedSources.delete(uri);
    sourceInput.cancelled = true;
    if (sourceInput.nativeReady) void enqueuePreloadCleanup(uri, sourceInput.source);
  }
};

/** Buffer a short lead-in; Expo reuses it when this URI starts playing. */
export const preloadAudio = async (sourceInput: AudioSourceInput): Promise<void> => {
  const source = toAudioSource(sourceInput);
  const uri = source.uri;
  if (parseNativeYouTubePlaybackUri(uri)) return;
  if (!uri || !isAppActive() || preloadedSources.has(uri)) return;
  // expo-audio preloads web URLs through fetch() and then plays the blob.
  // That bypasses the browser media element's Range handling for proxied audio.
  if (Platform.OS === 'web' && /^https?:\/\//i.test(uri)) return;

  const payload = source.headers ? source : uri;
  const entry: PreloadEntry = {
    source: payload,
    token: Symbol(uri),
    nativeReady: false,
    cancelled: false,
    operation: Promise.resolve(),
  };
  const previousForUri = preloadChains.get(uri) || Promise.resolve();
  const operation = previousForUri
    .catch(() => undefined)
    .then(async () => {
      if (!isAppActive() || preloadedSources.get(uri)?.token !== entry.token || entry.cancelled) return;
      await prepareLocalAudioForPlayback(uri);
      if (!isAppActive() || preloadedSources.get(uri)?.token !== entry.token || entry.cancelled) return;
      await Promise.resolve(preload(payload as any, { preferredForwardBufferDuration: 5 }));
      entry.nativeReady = true;
      if (preloadedSources.get(uri)?.token !== entry.token || entry.cancelled) {
        await clearPreloadedPayload(payload);
      }
    })
    .catch(() => {
      if (preloadedSources.get(uri)?.token === entry.token) preloadedSources.delete(uri);
    })
    .finally(() => {
      if (!entry.nativeReady && preloadedSources.get(uri)?.token === entry.token) {
        preloadedSources.delete(uri);
      }
      if (preloadChains.get(uri) === operation) preloadChains.delete(uri);
    });
  entry.operation = operation;
  preloadedSources.set(uri, entry);
  preloadChains.set(uri, operation);
  trimPreloadedSources();
  await operation;
};

const loadAndPlayNativeYouTube = async (
  videoId: string,
  onStatusUpdate: ((state: PlayerState) => void) | undefined,
  lockScreenMetadata: LockScreenMetadata | undefined,
  diagnosticTrack: PlaybackDiagnosticTrack | undefined
): Promise<boolean> => {
  const generation = loadGeneration + 1;
  try {
    beginTrackChange();
    // Native playback owns MPRemoteCommandCenter and Now Playing. Release any
    // dormant Expo player so one tap cannot be delivered to both engines.
    disposeCurrentPlayer();
    await nativeStopPromise;
    await configureAudioSession(diagnosticTrack?.spotifyId);
    if (generation !== loadGeneration) return false;

    currentSourceKind = 'remote';
    currentSourceHost = 'youtube.com';
    currentDiagnosticSpotifyId = diagnosticTrack?.spotifyId || null;
    lastDiagnosticSignature = '';
    nativeYouTubeActive = true;
    nativeYouTubeState = {
      ...DEFAULT_STATE,
      isBuffering: true,
      durationMs: 0,
    };
    nativeYouTubeStatusCallback = onStatusUpdate || null;
    recordAudioDiagnostic('native-stream-load-start', videoId);

    const publishStatus = async (force = false) => {
      if (!nativeYouTubeActive || generation !== loadGeneration) return;
      const status = await getNativeYouTubePlaybackStatus();
      if (!status || !nativeYouTubeActive || generation !== loadGeneration) return;
      const nextState: PlayerState = {
        isPlaying: status.isPlaying,
        isBuffering: status.isBuffering ?? false,
        isLoaded: status.isLoaded,
        positionMs: status.positionMs,
        durationMs: status.durationMs,
        didJustFinish: status.didJustFinish,
        error: status.error,
      };
      const changed = playbackTransition(nextState) !== playbackTransition(nativeYouTubeState) ||
        Math.abs(nextState.positionMs - nativeYouTubeState.positionMs) >= 400;
      nativeYouTubeState = nextState;
      if (force || changed) {
        recordStatusDiagnostic(nextState);
        nativeYouTubeStatusCallback?.(nextState);
      }
    };

    const ended = addNativeYouTubePlaybackListener('onNativePlaybackEnded', () => {
      void publishStatus(true);
    });
    const next = addNativeYouTubePlaybackListener('onNativeRemoteNext', () => {
      runRemoteCommand('next');
    });
    const previous = addNativeYouTubePlaybackListener('onNativeRemotePrevious', () => {
      runRemoteCommand('previous');
    });
    nativeYouTubeSubscriptions = [ended, next, previous].filter(
      (subscription): subscription is { remove(): void } => Boolean(subscription)
    );

    const started = await playYouTubeVideoNatively(videoId, {
      title: lockScreenMetadata?.title || diagnosticTrack?.title || 'Openfy Music',
      artist: lockScreenMetadata?.artist || diagnosticTrack?.artistName || '',
      albumTitle: lockScreenMetadata?.albumTitle || diagnosticTrack?.albumName,
      artworkUrl: lockScreenMetadata?.artworkUrl,
      durationMs: diagnosticTrack?.duration_ms,
    });
    if (!started || generation !== loadGeneration) {
      await stopNativeYouTubeEngine();
      return false;
    }

    nativeYouTubeStatusTimer = setInterval(() => {
      void publishStatus();
    }, 500);
    playerAppStateSubscription = AppState?.addEventListener('change', (state) => {
      if (!nativeYouTubeActive || generation !== loadGeneration) return;
      if (state === 'active') void publishStatus(true);
      else releaseAllPreloadedAudio();
    });
    await publishStatus(true);
    recordAudioDiagnostic('native-stream-play-called', videoId);
    return true;
  } catch (error) {
    if (generation !== loadGeneration) return false;
    await stopNativeYouTubeEngine();
    const failedState = { ...DEFAULT_STATE, error: String(error) };
    recordStatusDiagnostic(failedState);
    onStatusUpdate?.(failedState);
    console.error('[PlayerService] Native YouTube playback failed:', error);
    return false;
  }
};

/** Release a queued neighbor once it is no longer adjacent to the current track. */
export const releasePreloadedAudio = (sourceInput: AudioSourceInput): void => {
  const uri = getAudioSourceUri(sourceInput);
  const stored = preloadedSources.get(uri);
  if (!stored) return;
  preloadedSources.delete(uri);
  stored.cancelled = true;
  if (stored.nativeReady) void enqueuePreloadCleanup(uri, stored.source);
};

/** Retain only the playing AVPlayer when iOS backgrounds us or reports pressure. */
export const releaseAllPreloadedAudio = (): void => {
  for (const uri of preloadedSources.keys()) releasePreloadedAudio(uri);
};

/**
 * Load and play an audio URI or AudioSource (local file or remote stream).
 */
export const loadAndPlay = async (
  sourceInput: AudioSourceInput,
  onStatusUpdate?: (state: PlayerState) => void,
  lockScreenMetadata?: LockScreenMetadata,
  fadeInDurationMs = 0,
  diagnosticTrack?: PlaybackDiagnosticTrack
): Promise<boolean> => {
  const source = toAudioSource(sourceInput);
  const uri = source.uri;
  const nativeYouTubeVideoId = parseNativeYouTubePlaybackUri(uri);
  if (nativeYouTubeVideoId) {
    return loadAndPlayNativeYouTube(
      nativeYouTubeVideoId,
      onStatusUpdate,
      lockScreenMetadata,
      diagnosticTrack
    );
  }
  const generation = loadGeneration + 1;
  try {
    beginTrackChange();

    const callbackForThisPlayer = onStatusUpdate || null;
    await configureAudioSession(diagnosticTrack?.spotifyId);
    if (generation !== loadGeneration) return false;
    const repair = await prepareLocalAudioForPlayback(uri);
    if (generation !== loadGeneration) return false;
    const sourceDescription = describeSource(uri);
    currentSourceKind = sourceDescription.sourceKind;
    currentSourceHost = sourceDescription.sourceHost;
    currentDiagnosticSpotifyId = diagnosticTrack?.spotifyId || null;
    lastDiagnosticSignature = '';
    if (repair?.protectionBefore || repair?.protectionAfter) {
      recordAudioDiagnostic('file-protection', [
        repair.protectionBefore || 'unknown',
        repair.protectionAfter || 'unknown',
      ].join(' -> '));
    }
    recordAudioDiagnostic('load-start');

    console.log(
      '[PlayerService] Loading audio source:',
      uri,
      source.headers ? 'with custom headers' : 'without headers'
    );

    const playerSource = source.headers ? source : uri;
    // Only consume a finished preload. A neighbor buffer must never hold up
    // an explicit play request; an unfinished buffer is cancelled and released
    // by its own completion handler.
    const preloadEntry = preloadedSources.get(uri);
    if (preloadEntry?.nativeReady) {
      await preloadEntry.operation;
    } else if (preloadEntry) {
      preloadEntry.cancelled = true;
    }
    if (generation !== loadGeneration) return false;
    preloadedSources.delete(uri);
    const player = playerInstance || createAudioPlayer(playerSource as any, getPlayerOptions());
    if (playerInstance) player.replace(playerSource as any);
    playerInstance = player;
    if (Platform.OS !== 'ios') void enqueuePreloadCleanup(uri, playerSource);
    player.volume = fadeInDurationMs > 0 ? 0 : 1;

    playerRemoteNextSubscription = player.addListener('remoteNextTrack', () => {
      runRemoteCommand('next');
    });
    playerRemotePreviousSubscription = player.addListener('remotePreviousTrack', () => {
      runRemoteCommand('previous');
    });

    if (lockScreenMetadata) {
      try {
        player.setActiveForLockScreen(true, lockScreenMetadata, {
          showNextTrack: true,
          showPreviousTrack: true,
          showSeekBackward: false,
          showSeekForward: false,
        });
      } catch (error) {
        console.warn('[PlayerService] Lock screen controls unavailable:', error);
      }
    } else {
      player.clearLockScreenControls();
    }

    let lastTransition = '';
    let lastPositionMs = 0;
    const publishStatus = (status: AudioStatus, force = false) => {
      if (generation !== loadGeneration || playerInstance !== player) return;
      const state = toState(status);
      if (state.error && state.positionMs === 0) {
        state.positionMs = lastPositionMs;
      } else if (state.isLoaded && !state.error) {
        lastPositionMs = state.positionMs;
      }
      const transition = playbackTransition(state);
      // Native audio and lock-screen controls keep running. Hidden React views
      // only need errors, end-of-track and playback transitions, not every tick.
      if (!force && !isAppActive() && transition === lastTransition) return;
      lastTransition = transition;
      recordStatusDiagnostic(state);
      callbackForThisPlayer?.(state);
    };
    playerStatusSubscription = player.addListener('playbackStatusUpdate', publishStatus);
    if (Platform.OS !== 'web') {
      playerAppStateSubscription = AppState?.addEventListener('change', (state) => {
        if (generation !== loadGeneration || playerInstance !== player) return;
        if (state === 'active') {
          publishStatus(player.currentStatus, true);
        } else {
          releaseAllPreloadedAudio();
        }
      });
    }

    player.play();
    recordAudioDiagnostic('play-called');
    if (fadeInDurationMs > 0) {
      void rampPlayerVolume(player, 1, fadeInDurationMs);
    }
    return true;
  } catch (error) {
    if (generation !== loadGeneration) return false;
    disposeCurrentPlayer();
    console.error('[PlayerService] Failed to load audio:', error, 'URI:', uri);
    const callbackForThisPlayer = onStatusUpdate || null;
    const failedState = { ...DEFAULT_STATE, error: String(error) };
    recordStatusDiagnostic(failedState);
    callbackForThisPlayer?.(failedState);
    return false;
  }
};

/**
 * Play / resume playback.
 */
export const play = async (): Promise<void> => {
  if (nativeYouTubeActive) {
    await configureAudioSession();
    await resumeNativeYouTubePlayback();
    nativeYouTubeState = { ...nativeYouTubeState, isPlaying: true };
    nativeYouTubeStatusCallback?.(nativeYouTubeState);
    recordAudioDiagnostic('native-resume-called');
    return;
  }
  const player = playerInstance;
  const generation = loadGeneration;
  if (!player) return;
  try {
    await configureAudioSession();
    if (generation !== loadGeneration || playerInstance !== player) return;
    player.play();
    recordAudioDiagnostic('resume-called');
  } catch (error) {
    console.error('[PlayerService] play error:', error);
  }
};

/**
 * Pause playback.
 */
export const pause = async (): Promise<void> => {
  if (nativeYouTubeActive) {
    await pauseNativeYouTubePlayback();
    nativeYouTubeState = { ...nativeYouTubeState, isPlaying: false };
    nativeYouTubeStatusCallback?.(nativeYouTubeState);
    recordAudioDiagnostic('native-pause-called');
    return;
  }
  if (!playerInstance) return;
  try {
    playerInstance.pause();
    recordAudioDiagnostic('pause-called');
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach((el) => el.pause());
    }
  } catch (error) {
    console.error('[PlayerService] pause error:', error);
  }
};

/**
 * Seek to position in milliseconds.
 */
export const seekTo = async (positionMs: number): Promise<void> => {
  if (nativeYouTubeActive) {
    await seekNativeYouTubePlayback(positionMs);
    nativeYouTubeState = {
      ...nativeYouTubeState,
      positionMs: Math.max(0, positionMs),
      didJustFinish: false,
    };
    nativeYouTubeStatusCallback?.(nativeYouTubeState);
    return;
  }
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
  loadGeneration++;
  try {
    disposeCurrentPlayer();
    releaseAllPreloadedAudio();
    recordAudioDiagnostic('unload');
    currentSourceKind = 'none';
    currentSourceHost = undefined;
    currentDiagnosticSpotifyId = null;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach((el) => {
        el.pause();
        el.src = '';
      });
    }
  } catch (error) {
    console.error('[PlayerService] unload error:', error);
  }
};

/**
 * Get current player state.
 */
export const getPlayerState = (): PlayerState => {
  if (nativeYouTubeActive) return nativeYouTubeState;
  if (!playerInstance) return DEFAULT_STATE;
  try {
    const status = playerInstance.currentStatus;
    return toState(status);
  } catch {
    return DEFAULT_STATE;
  }
};

export const getStatus = getPlayerState;
