import { Platform } from 'react-native';

export type NativeYouTubeTransferResult = {
  uri?: string;
  status?: number;
  mimeType?: string | null;
  headers?: Record<string, string>;
  totalBytes?: number;
  sourceUrl: string;
};

export type NativeYouTubePlaybackStatus = {
  isPlaying: boolean;
  isLoaded: boolean;
  isBuffering?: boolean;
  positionMs: number;
  durationMs: number;
  didJustFinish?: boolean;
  error?: string;
};

export type NativeYouTubePlaybackMetadata = {
  title: string;
  artist: string;
  albumTitle?: string;
  artworkUrl?: string;
  artworkFallbackUrl?: string;
  durationMs?: number;
};

export type NativeYouTubePlaybackEvent =
  | 'onNativePlaybackEnded'
  | 'onNativeRemoteNext'
  | 'onNativeRemotePrevious';

type NativeSubscription = { remove(): void };

type OpenfyYouTubeNativeModule = {
  downloadGoogleVideoAsync(
    url: string,
    destination: string,
    headers: Record<string, string>,
    chunkBytes: number
  ): Promise<unknown>;
  resolveAndDownloadGoogleVideoAsync?(
    videoId: string,
    destination: string,
    chunkBytes: number
  ): Promise<unknown>;
  playNativeYouTubeAsync?(videoId: string): Promise<void>;
  playNativeYouTubeWithMetadataAsync?(
    videoId: string,
    metadata: Record<string, string>
  ): Promise<void>;
  pauseNativeYouTubeAsync?(): Promise<void>;
  resumeNativeYouTubeAsync?(): Promise<void>;
  seekNativeYouTubeAsync?(positionMs: number): Promise<void>;
  stopNativeYouTubeAsync?(): Promise<void>;
  getNativePlaybackStatusAsync?(): Promise<unknown>;
  addListener?(
    eventName: NativeYouTubePlaybackEvent,
    listener: () => void
  ): NativeSubscription;
};

const NATIVE_TRANSFER_CHUNK_BYTES = 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const asStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[0] === 'string' && typeof entry[1] === 'string'
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
};

const getNativeModule = (): OpenfyYouTubeNativeModule | null => {
  if (Platform.OS === 'web') return null;
  try {
    // This is intentionally lazy. A development client built before this
    // module exists keeps using the Expo fallback instead of crashing.
    const loaded = require('../../modules/openfy-youtube').default as unknown;
    if (
      isRecord(loaded) &&
      typeof loaded.downloadGoogleVideoAsync === 'function'
    ) {
      return loaded as unknown as OpenfyYouTubeNativeModule;
    }
  } catch {
    // Native module not present in the currently installed binary.
  }
  return null;
};

export const hasNativeYouTubeTransfer = () => Boolean(getNativeModule());

export const hasNativeYouTubeDownload = () =>
  Platform.OS === 'ios' &&
  typeof getNativeModule()?.resolveAndDownloadGoogleVideoAsync === 'function';

export const NATIVE_YOUTUBE_PLAYBACK_PREFIX = 'openfy-youtube://video/';

export const toNativeYouTubePlaybackUri = (videoId: string): string =>
  `${NATIVE_YOUTUBE_PLAYBACK_PREFIX}${videoId}`;

export const parseNativeYouTubePlaybackUri = (uri: string): string | null => {
  if (!uri.startsWith(NATIVE_YOUTUBE_PLAYBACK_PREFIX)) return null;
  const videoId = uri.slice(NATIVE_YOUTUBE_PLAYBACK_PREFIX.length);
  return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
};

export const hasNativeYouTubePlayback = (): boolean =>
  Platform.OS === 'ios' &&
  typeof getNativeModule()?.playNativeYouTubeAsync === 'function';

const metadataRecord = (
  metadata: NativeYouTubePlaybackMetadata
): Record<string, string> => ({
  title: metadata.title,
  artist: metadata.artist,
  ...(metadata.albumTitle ? { albumTitle: metadata.albumTitle } : {}),
  ...(metadata.artworkUrl ? { artworkUrl: metadata.artworkUrl } : {}),
  ...(metadata.artworkFallbackUrl
    ? { artworkFallbackUrl: metadata.artworkFallbackUrl }
    : {}),
  ...(metadata.durationMs && metadata.durationMs > 0
    ? { durationMs: String(Math.round(metadata.durationMs)) }
    : {}),
});

export const playYouTubeVideoNatively = async (
  videoId: string,
  metadata: NativeYouTubePlaybackMetadata
): Promise<boolean> => {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return false;
  const nativeModule = getNativeModule();
  if (!nativeModule?.playNativeYouTubeAsync) return false;
  if (nativeModule.playNativeYouTubeWithMetadataAsync) {
    await nativeModule.playNativeYouTubeWithMetadataAsync(
      videoId,
      metadataRecord(metadata)
    );
  } else {
    await nativeModule.playNativeYouTubeAsync(videoId);
  }
  return true;
};

export const pauseNativeYouTubePlayback = async (): Promise<void> => {
  await getNativeModule()?.pauseNativeYouTubeAsync?.();
};

export const resumeNativeYouTubePlayback = async (): Promise<void> => {
  await getNativeModule()?.resumeNativeYouTubeAsync?.();
};

export const seekNativeYouTubePlayback = async (
  positionMs: number
): Promise<void> => {
  await getNativeModule()?.seekNativeYouTubeAsync?.(Math.max(0, positionMs));
};

export const stopNativeYouTubePlayback = async (): Promise<void> => {
  await getNativeModule()?.stopNativeYouTubeAsync?.();
};

export const getNativeYouTubePlaybackStatus = async ():
Promise<NativeYouTubePlaybackStatus | null> => {
  const raw = await getNativeModule()?.getNativePlaybackStatusAsync?.();
  if (!isRecord(raw)) return null;
  return {
    isPlaying: raw.isPlaying === true,
    isLoaded: raw.isLoaded === true,
    isBuffering: raw.isBuffering === true,
    positionMs: typeof raw.positionMs === 'number' ? raw.positionMs : 0,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 0,
    ...(raw.didJustFinish === true ? { didJustFinish: true } : {}),
    ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
  };
};

export const addNativeYouTubePlaybackListener = (
  eventName: NativeYouTubePlaybackEvent,
  listener: () => void
): NativeSubscription | null => {
  try {
    return getNativeModule()?.addListener?.(eventName, listener) || null;
  } catch {
    return null;
  }
};

/**
 * Native iOS/Android range transfer used only for direct googlevideo sources.
 * It is deliberately absent on web, where the browser owns the media request.
 */
export const downloadYouTubeStreamNatively = async (
  url: string,
  destination: string,
  headers: Record<string, string>
): Promise<NativeYouTubeTransferResult | null> => {
  const nativeModule = getNativeModule();
  if (!nativeModule) return null;

  const rawResult = await nativeModule.downloadGoogleVideoAsync(
    url,
    destination,
    headers,
    NATIVE_TRANSFER_CHUNK_BYTES
  );
  if (!isRecord(rawResult)) return null;

  return {
    ...(typeof rawResult.uri === 'string' ? { uri: rawResult.uri } : {}),
    ...(typeof rawResult.status === 'number' ? { status: rawResult.status } : {}),
    ...(typeof rawResult.mimeType === 'string' || rawResult.mimeType === null
      ? { mimeType: rawResult.mimeType }
      : {}),
    ...(asStringRecord(rawResult.headers)
      ? { headers: asStringRecord(rawResult.headers) }
      : {}),
    ...(typeof rawResult.totalBytes === 'number'
      ? { totalBytes: rawResult.totalBytes }
      : {}),
    sourceUrl: url,
  };
};

/**
 * iOS-only path that keeps the YouTube `player` request and every media
 * range on one URLSession. Googlevideo can reject a URL when those requests
 * leave through different networking stacks, even on the same device.
 */
export const resolveAndDownloadYouTubeVideoNatively = async (
  videoId: string,
  destination: string
): Promise<NativeYouTubeTransferResult | null> => {
  if (Platform.OS !== 'ios' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return null;
  }
  const nativeModule = getNativeModule();
  if (!nativeModule?.resolveAndDownloadGoogleVideoAsync) return null;

  const rawResult = await nativeModule.resolveAndDownloadGoogleVideoAsync(
    videoId,
    destination,
    NATIVE_TRANSFER_CHUNK_BYTES
  );
  if (!isRecord(rawResult)) return null;

  return {
    ...(typeof rawResult.uri === 'string' ? { uri: rawResult.uri } : {}),
    ...(typeof rawResult.status === 'number' ? { status: rawResult.status } : {}),
    ...(typeof rawResult.mimeType === 'string' || rawResult.mimeType === null
      ? { mimeType: rawResult.mimeType }
      : {}),
    ...(asStringRecord(rawResult.headers)
      ? { headers: asStringRecord(rawResult.headers) }
      : {}),
    ...(typeof rawResult.totalBytes === 'number'
      ? { totalBytes: rawResult.totalBytes }
      : {}),
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
};

export const __nativeYouTubeTransfer = {
  asStringRecord,
};
