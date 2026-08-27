import { Platform } from 'react-native';

export type NativeYouTubeTransferResult = {
  uri?: string;
  status?: number;
  mimeType?: string | null;
  headers?: Record<string, string>;
  totalBytes?: number;
  sourceUrl: string;
};

type OpenfyYouTubeNativeModule = {
  downloadGoogleVideoAsync(
    url: string,
    destination: string,
    headers: Record<string, string>,
    chunkBytes: number
  ): Promise<unknown>;
};

const NATIVE_TRANSFER_CHUNK_BYTES = 2 * 1024 * 1024;

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

export const __nativeYouTubeTransfer = {
  asStringRecord,
};
