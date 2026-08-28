/**
 * Download Manager Service
 * Handles downloading audio files (both progressive MP3/M4A and assembled HLS .m3u8 streams)
 * and cover art to device local storage for 100% offline playback.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_AUDIO_ONLY, MUSIC_SERVER_URL } from '@config';
import { fetchLyrics, saveLyricsOffline } from '../lyrics/lyricsService';
import {
  getPlayableAudioUrl,
  resolveAudioUrl,
  resolveViaSoundCloud,
  resolveViaYouTubeTopic,
} from '../audio/audioResolver';
import {
  getDirectYouTubeMediaHeaders,
  reportDirectYouTubeStreamRefusal,
} from '../audio/directYouTubeResolver';
import {
  downloadYouTubeStreamNatively,
  resolveAndDownloadYouTubeVideoNatively,
} from '../audio/nativeYouTubeTransfer';
import {
  recordDownloadDiagnostic,
  startDownloadDiagnostics,
} from './downloadDiagnostics';

export type DownloadStatus = 'idle' | 'downloading' | 'completed' | 'error';

export type DownloadedTrack = {
  id: string;
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  localAudioPath: string;
  localImagePath: string;
  downloadedAt: string;
  duration_ms: number;
  audioUrl?: string;
};

export type DownloadProgress = {
  trackId: string;
  progress: number; // 0-1
  status: DownloadStatus;
  error?: string;
};

export type DownloadTrackInput = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  duration_ms: number;
  audioUrl?: string;
  audioFormat?: string;
};

export type PendingDownload = {
  track: DownloadTrackInput;
  audioUrl?: string;
  audioFormat: string;
  queuedAt: string;
  attempts: number;
  lastAttemptAt?: string;
};

const DOWNLOADS_STORAGE_KEY = 'openfy_downloads';
const PENDING_DOWNLOADS_STORAGE_KEY = 'openfy_pending_downloads';
const DOWNLOADS_DIR = `${FileSystem.documentDirectory || ''}openfy_downloads/`;
const COVERS_DIR = `${FileSystem.documentDirectory || ''}openfy_covers/`;
const activeDownloads = new Map<string, Promise<DownloadedTrack | null>>();
const activeResumables = new Map<
  string,
  ReturnType<typeof FileSystem.createDownloadResumable>
>();
const cancelledDownloads = new Set<string>();
const BACKGROUND_RETRY_BASE_MS = 15 * 60 * 1000;
const BACKGROUND_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
const MAX_BACKGROUND_ATTEMPTS = 8;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const audioUrlOrigin = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return 'invalid URL';
  }
};

// Googlevideo accepts the same Range transport used to validate local streams.
// iOS URLSession may reject the otherwise identical whole-file request with 403.
const audioRequestHeaders = (url: string): Record<string, string> | undefined => {
  const mediaHeaders = getDirectYouTubeMediaHeaders(url);
  return mediaHeaders ? { ...mediaHeaders, Range: 'bytes=0-' } : undefined;
};

const diagnosticsIdFromTrackId = (trackId: string) =>
  trackId.startsWith('track_') ? trackId.slice('track_'.length) : trackId;

const selectResponseHeaders = (headers?: Record<string, string>) => {
  if (!headers) return undefined;
  const wanted = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'date',
    'server',
  ];
  const selected = Object.fromEntries(
    Object.entries(headers).filter(([name]) => wanted.includes(name.toLowerCase()))
  );
  return Object.keys(selected).length ? selected : undefined;
};

type NativeDownloadResult = {
  uri?: string;
  status?: number;
  mimeType?: string | null;
  headers?: Record<string, string>;
  sourceUrl?: string;
};

const isAudioMimeType = (mimeType?: string | null) =>
  !mimeType || /^(audio\/|video\/|application\/octet-stream$)/i.test(mimeType);

const validateDownloadedAudio = async (
  result: NativeDownloadResult | null | undefined,
  trackId: string,
  transport: string,
  session: 'background' | 'foreground'
): Promise<string | null> => {
  const spotifyId = diagnosticsIdFromTrackId(trackId);
  const details = {
    transport,
    session,
    status: result?.status,
    mimeType: result?.mimeType,
    headers: selectResponseHeaders(result?.headers),
  };
  recordDownloadDiagnostic(spotifyId, 'audio.response', details);

  if (!result?.uri) {
    recordDownloadDiagnostic(spotifyId, 'audio.invalid_response', {
      ...details,
      reason: 'missing_file_uri',
    });
    if (
      result?.sourceUrl &&
      typeof result.status === 'number' &&
      (result.status < 200 || result.status >= 300)
    ) {
      await reportDirectYouTubeStreamRefusal(result.sourceUrl, result.status);
    }
    return null;
  }

  const fileInfo = await FileSystem.getInfoAsync(result.uri);
  const bytes = fileInfo.exists ? fileInfo.size : undefined;
  const successfulStatus =
    result.status === undefined || (result.status >= 200 && result.status < 300);
  const valid =
    successfulStatus &&
    isAudioMimeType(result.mimeType) &&
    fileInfo.exists &&
    Boolean(bytes && bytes > 50000);
  if (valid) {
    recordDownloadDiagnostic(spotifyId, 'audio.saved', {
      ...details,
      bytes,
    });
    return result.uri;
  }

  recordDownloadDiagnostic(spotifyId, 'audio.invalid_response', {
    ...details,
    bytes,
    reason: !successfulStatus
      ? 'http_status'
      : !isAudioMimeType(result.mimeType)
        ? 'unexpected_mime_type'
        : 'file_too_small',
  });
  if (!successfulStatus && result.sourceUrl && typeof result.status === 'number') {
    await reportDirectYouTubeStreamRefusal(result.sourceUrl, result.status);
  }
  await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
  return null;
};

const createStorageMutationQueue = () => {
  let previous = Promise.resolve();

  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const before = previous;
    let release = () => {};
    previous = new Promise<void>((resolve) => {
      release = resolve;
    });
    await before;
    try {
      return await operation();
    } finally {
      release();
    }
  };
};

const mutateDownloadedStorage = createStorageMutationQueue();
const mutatePendingStorage = createStorageMutationQueue();

/**
 * Ensure download directories exist
 */
export const ensureDirectories = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    const downloadsInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
    if (!downloadsInfo.exists) {
      await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
    }

    const coversInfo = await FileSystem.getInfoAsync(COVERS_DIR);
    if (!coversInfo.exists) {
      await FileSystem.makeDirectoryAsync(COVERS_DIR, { intermediates: true });
    }
  } catch (e) {
    console.warn('[DownloadManager] ensureDirectories warning:', e);
  }
};

/**
 * Get all downloaded tracks from AsyncStorage
 */
export const getDownloadedTracks = async (): Promise<DownloadedTrack[]> => {
  try {
    const stored = await AsyncStorage.getItem(DOWNLOADS_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as DownloadedTrack[];
  } catch {
    return [];
  }
};

/**
 * Save downloaded tracks list to AsyncStorage
 */
const saveDownloadedTracks = async (tracks: DownloadedTrack[]): Promise<void> => {
  await AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(tracks));
};

const updateDownloadedTracks = async (
  update: (tracks: DownloadedTrack[]) => DownloadedTrack[]
): Promise<void> => {
  await mutateDownloadedStorage(async () => {
    await saveDownloadedTracks(update(await getDownloadedTracks()));
  });
};

export const getPendingDownloads = async (): Promise<PendingDownload[]> => {
  try {
    const stored = await AsyncStorage.getItem(PENDING_DOWNLOADS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingDownload[]) : [];
  } catch {
    return [];
  }
};

const savePendingDownloads = async (
  downloads: PendingDownload[]
): Promise<void> => {
  await AsyncStorage.setItem(
    PENDING_DOWNLOADS_STORAGE_KEY,
    JSON.stringify(downloads)
  );
};

const updatePendingDownloads = async (
  update: (downloads: PendingDownload[]) => PendingDownload[]
): Promise<void> => {
  await mutatePendingStorage(async () => {
    await savePendingDownloads(update(await getPendingDownloads()));
  });
};

const upsertPendingDownload = async (
  track: DownloadTrackInput,
  audioUrl?: string,
  audioFormat = 'mp3'
): Promise<void> => {
  await updatePendingDownloads((downloads) => {
    const existing = downloads.find(
      (candidate) => candidate.track.spotifyId === track.spotifyId
    );
    const next: PendingDownload = {
      track,
      audioUrl,
      audioFormat,
      queuedAt: existing?.queuedAt || new Date().toISOString(),
      attempts: existing?.attempts || 0,
      lastAttemptAt: new Date().toISOString(),
    };
    return [
      ...downloads.filter(
        (candidate) => candidate.track.spotifyId !== track.spotifyId
      ),
      next,
    ];
  });
};

/** Persist a batch before work starts so iOS can resume it after suspension. */
export const queueDownloads = async (
  tracks: DownloadTrackInput[]
): Promise<void> => {
  await Promise.all(
    tracks.map((track) =>
      upsertPendingDownload(track, track.audioUrl, track.audioFormat || 'mp3')
    )
  );
};

const removePendingDownload = async (spotifyId: string): Promise<void> => {
  await updatePendingDownloads((downloads) =>
    downloads.filter((candidate) => candidate.track.spotifyId !== spotifyId)
  );
};

/** Stops an active native transfer and removes its persisted retry entry. */
export const cancelDownload = async (spotifyId: string): Promise<void> => {
  cancelledDownloads.add(spotifyId);
  recordDownloadDiagnostic(spotifyId, 'download.cancelled');
  const resumable = activeResumables.get(`track_${spotifyId}`);
  if (resumable) {
    await resumable.cancelAsync().catch(() => {});
  }
  await removePendingDownload(spotifyId);
};

const recordPendingDownloadFailure = async (spotifyId: string): Promise<void> => {
  await updatePendingDownloads((downloads) =>
    downloads.map((candidate) =>
      candidate.track.spotifyId === spotifyId
        ? {
            ...candidate,
            attempts: candidate.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
          }
        : candidate
    )
  );
};

const canRetryPendingDownload = (download: PendingDownload): boolean => {
  if (download.attempts >= MAX_BACKGROUND_ATTEMPTS) return false;
  if (!download.lastAttemptAt || download.attempts === 0) return true;

  const previousAttempt = new Date(download.lastAttemptAt).getTime();
  if (Number.isNaN(previousAttempt)) return true;

  const delay = Math.min(
    BACKGROUND_RETRY_MAX_MS,
    BACKGROUND_RETRY_BASE_MS * 2 ** Math.max(0, download.attempts - 1)
  );
  return Date.now() - previousAttempt >= delay;
};

/**
 * Check if a track is already downloaded
 */
export const isTrackDownloaded = async (spotifyId: string): Promise<boolean> => {
  const tracks = await getDownloadedTracks();
  return tracks.some((t) => t.spotifyId === spotifyId);
};

/**
 * Get a specific downloaded track by spotifyId
 */
export const getDownloadedTrack = async (
  spotifyId: string
): Promise<DownloadedTrack | null> => {
  const tracks = await getDownloadedTracks();
  return tracks.find((t) => t.spotifyId === spotifyId) || null;
};

/**
 * Helper to convert Uint8Array / ArrayBuffer to Base64 in Hermes/React Native
 */
const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const globalObj = globalThis as { btoa?: (s: string) => string };
  if (typeof globalObj.btoa === 'function') {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return globalObj.btoa(binary);
  }

  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    let enc3 = ((b2 & 15) << 2) | (b3 >> 6);
    let enc4 = b3 & 63;

    if (i + 1 >= len) {
      enc3 = 64;
      enc4 = 64;
    } else if (i + 2 >= len) {
      enc4 = 64;
    }

    base64 +=
      chars.charAt(enc1) +
      chars.charAt(enc2) +
      (enc3 === 64 ? '=' : chars.charAt(enc3)) +
      (enc4 === 64 ? '=' : chars.charAt(enc4));
  }
  return base64;
};

const FETCH_AUDIO_FALLBACK_MAX_BYTES = 32 * 1024 * 1024;
const GOOGLEVIDEO_FETCH_CHUNK_BYTES = 1024 * 1024;

const googleVideoContentLength = (url: string) => {
  if (!getDirectYouTubeMediaHeaders(url)) return null;
  try {
    const value = Number(new URL(url).searchParams.get('clen'));
    return Number.isInteger(value) && value > 0 && value <= FETCH_AUDIO_FALLBACK_MAX_BYTES
      ? value
      : null;
  } catch {
    return null;
  }
};

const responseHeaders = (response: Response) =>
  Object.fromEntries(
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'date', 'server'].flatMap(
      (name) => {
        const value = response.headers.get(name);
        return value ? [[name, value]] : [];
      }
    )
  );

const downloadGoogleVideoChunks = async (
  audioUrl: string,
  localPath: string,
  trackId: string,
  totalBytes: number,
  headers: Record<string, string>
): Promise<string | null> => {
  const spotifyId = diagnosticsIdFromTrackId(trackId);
  let written = 0;
  let lastResponse: Response | null = null;
  let lastHeaders: Record<string, string> | undefined;
  let lastMimeType: string | null = null;

  await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
  while (written < totalBytes) {
    const end = Math.min(written + GOOGLEVIDEO_FETCH_CHUNK_BYTES, totalBytes) - 1;
    const range = `bytes=${written}-${end}`;
    const response = await fetch(audioUrl, { headers: { ...headers, Range: range } });
    const currentHeaders = responseHeaders(response);
    const mimeType = response.headers.get('content-type');
    const contentRange = response.headers.get('content-range');

    if (!response.ok || !isAudioMimeType(mimeType)) {
      recordDownloadDiagnostic(spotifyId, 'audio.invalid_response', {
        transport: 'fetch',
        session: 'foreground',
        status: response.status,
        mimeType,
        headers: currentHeaders,
        range,
        reason: !response.ok ? 'http_status' : 'unexpected_mime_type',
      });
      if (!response.ok) await reportDirectYouTubeStreamRefusal(audioUrl, response.status);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const expectedBytes = end - written + 1;
    const wrongRange =
      response.status === 206 && !contentRange?.startsWith(`bytes ${written}-`);
    if (!buffer.byteLength || buffer.byteLength > expectedBytes || wrongRange) {
      recordDownloadDiagnostic(spotifyId, 'audio.invalid_response', {
        transport: 'fetch',
        session: 'foreground',
        status: response.status,
        mimeType,
        headers: currentHeaders,
        range,
        bytes: buffer.byteLength,
        reason: wrongRange ? 'invalid_content_range' : 'invalid_range_body',
      });
      return null;
    }

    await FileSystem.writeAsStringAsync(localPath, bufferToBase64(buffer), {
      encoding: FileSystem.EncodingType.Base64,
      append: written > 0,
    });
    written += buffer.byteLength;
    lastResponse = response;
    lastHeaders = currentHeaders;
    lastMimeType = mimeType;
  }

  return validateDownloadedAudio(
    {
      uri: localPath,
      status: lastResponse?.status,
      mimeType: lastMimeType,
      headers: lastHeaders,
      sourceUrl: audioUrl,
    },
    trackId,
    'fetch',
    'foreground'
  );
};

const downloadAudioWithFetch = async (
  audioUrl: string,
  localPath: string,
  trackId: string,
  format: string
): Promise<string | null> => {
  const spotifyId = diagnosticsIdFromTrackId(trackId);
  const transport = 'fetch';
  const session = 'foreground';
  const headers = audioRequestHeaders(audioUrl);
  const chunkedTotalBytes = googleVideoContentLength(audioUrl);

  try {
    recordDownloadDiagnostic(spotifyId, 'audio.request', {
      method: 'GET',
      transport,
      session,
      url: audioUrl,
      format,
      range: headers?.Range,
    });
    if (headers && chunkedTotalBytes) {
      return await downloadGoogleVideoChunks(
        audioUrl,
        localPath,
        trackId,
        chunkedTotalBytes,
        headers
      );
    }
    const response = await fetch(audioUrl, headers ? { headers } : undefined);
    const receivedHeaders = responseHeaders(response);
    const mimeType = response.headers.get('content-type');
    const contentLength = Number(response.headers.get('content-length') || 0);

    if (!response.ok || !isAudioMimeType(mimeType)) {
      recordDownloadDiagnostic(spotifyId, 'audio.invalid_response', {
        transport,
        session,
        status: response.status,
        mimeType,
        headers: receivedHeaders,
        reason: !response.ok ? 'http_status' : 'unexpected_mime_type',
      });
      if (!response.ok) {
        await reportDirectYouTubeStreamRefusal(audioUrl, response.status);
      }
      return null;
    }
    if (contentLength > FETCH_AUDIO_FALLBACK_MAX_BYTES) {
      recordDownloadDiagnostic(spotifyId, 'audio.failed', {
        transport,
        session,
        bytes: contentLength,
        reason: 'fetch_body_too_large',
      });
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (
      buffer.byteLength < 50000 ||
      buffer.byteLength > FETCH_AUDIO_FALLBACK_MAX_BYTES
    ) {
      recordDownloadDiagnostic(spotifyId, 'audio.invalid_response', {
        transport,
        session,
        bytes: buffer.byteLength,
        reason:
          buffer.byteLength < 50000 ? 'file_too_small' : 'fetch_body_too_large',
      });
      return null;
    }

    await FileSystem.writeAsStringAsync(localPath, bufferToBase64(buffer), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return validateDownloadedAudio(
      {
        uri: localPath,
        status: response.status,
        mimeType,
        headers: receivedHeaders,
        sourceUrl: audioUrl,
      },
      trackId,
      transport,
      session
    );
  } catch (error) {
    recordDownloadDiagnostic(spotifyId, 'audio.failed', {
      transport,
      session,
      error: errorMessage(error),
    });
    console.warn(
      `[DownloadManager] Fetch download failed from ${audioUrlOrigin(audioUrl)}: ${errorMessage(error)}`
    );
    return null;
  }
};

/**
 * Download HLS .m3u8 stream by fetching audio segments in parallel batches
 * and concatenating them cleanly to local storage.
 */
const downloadHlsAudio = async (
  m3u8Url: string,
  localPath: string,
  onProgress?: (progress: number) => void
): Promise<string | null> => {
  if (Platform.OS === 'web') return m3u8Url;
  try {
    console.log('[DownloadManager] Fetching HLS m3u8 playlist...');
    const res = await fetch(m3u8Url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching playlist`);

    const m3u8Text = await res.text();
    const segments = m3u8Text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('http'));

    if (segments.length === 0) {
      throw new Error('No audio segments in m3u8 playlist');
    }

    console.log(`[DownloadManager] Downloading ${segments.length} audio chunks...`);

    // Ensure parent dir exists and delete previous incomplete file
    await ensureDirectories();
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }

    const BATCH_SIZE = 4;
    let writtenChunks = 0;

    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const batch = segments.slice(i, i + BATCH_SIZE);
      const batchBuffers = await Promise.all(
        batch.map(async (url) => {
          try {
            const segRes = await fetch(url);
            if (!segRes.ok) return null;
            return await segRes.arrayBuffer();
          } catch {
            return null;
          }
        })
      );

      for (let j = 0; j < batchBuffers.length; j++) {
        const buf = batchBuffers[j];
        if (!buf) continue;

        const b64 = bufferToBase64(buf);
        if (b64) {
          await FileSystem.writeAsStringAsync(localPath, b64, {
            encoding: FileSystem.EncodingType.Base64,
            append: writtenChunks > 0,
          });
          writtenChunks++;
        }
      }

      onProgress?.(Math.min(1, (i + BATCH_SIZE) / segments.length));
    }

    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists && fileInfo.size && fileInfo.size > 50000) {
      console.log(`[DownloadManager] HLS download success: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);
      return fileInfo.uri;
    }
    return null;
  } catch (err) {
    console.error('[DownloadManager] HLS download error:', err);
    return null;
  }
};

/**
 * Download audio file from URL to local storage.
 * Seamlessly handles direct MP3/M4A URLs and HLS .m3u8 streams on native and web.
 */
export const downloadAudio = async (
  audioUrl: string,
  trackId: string,
  format: string = 'mp3',
  onProgress?: (progress: number) => void,
  youtubeVideoId?: string
): Promise<string | null> => {
  if (!audioUrl) return null;
  if (Platform.OS === 'web') {
    onProgress?.(1);
    return audioUrl;
  }

  try {
    await ensureDirectories();
    const cleanFormat = format === 'm3u8' ? 'mp3' : format || 'mp3';
    const localPath = `${DOWNLOADS_DIR}${trackId}.${cleanFormat}`;
    const spotifyId = diagnosticsIdFromTrackId(trackId);
    const headers = audioRequestHeaders(audioUrl);
    const googleVideoHeaders = getDirectYouTubeMediaHeaders(audioUrl);

    // Keep the minting `player` call and the media ranges inside one iOS
    // URLSession. A signed URL resolved by JavaScript can be refused by the
    // native transfer before its first byte when the two stacks choose
    // different network paths.
    if (youtubeVideoId) {
      try {
        recordDownloadDiagnostic(spotifyId, 'audio.request', {
          method: 'POST + GET',
          transport: 'native_player_range',
          session: 'foreground',
          url: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
          format: cleanFormat,
          range: 'bytes=0-2097151',
        });
        const nativeResolvedResult = await resolveAndDownloadYouTubeVideoNatively(
          youtubeVideoId,
          localPath
        );
        if (nativeResolvedResult) {
          const validResult = await validateDownloadedAudio(
            nativeResolvedResult,
            trackId,
            'native_player_range',
            'foreground'
          );
          if (validResult) return validResult;
        }
      } catch (error) {
        recordDownloadDiagnostic(spotifyId, 'audio.failed', {
          transport: 'native_player_range',
          session: 'foreground',
          error: errorMessage(error),
        });
      }
    }

    // 1. If HLS .m3u8 playlist
    if (audioUrl.includes('.m3u8')) {
      console.log('[DownloadManager] Downloading HLS stream to local MP3...');
      const hlsResult = await downloadHlsAudio(audioUrl, localPath, onProgress);
      if (hlsResult) return hlsResult;
    }

    // Keep every googlevideo range in the same native transport. This is the
    // critical BitChord behaviour: URLSession/OkHttp sends the identity that
    // minted the signed stream instead of mixing it with Expo FileSystem.
    if (googleVideoHeaders) {
      try {
        recordDownloadDiagnostic(spotifyId, 'audio.request', {
          method: 'GET',
          transport: 'native_range',
          session: 'foreground',
          url: audioUrl,
          format: cleanFormat,
          range: 'bytes=0-2097151',
        });
        const nativeResult = await downloadYouTubeStreamNatively(
          audioUrl,
          localPath,
          googleVideoHeaders
        );
        if (nativeResult) {
          const validResult = await validateDownloadedAudio(
            nativeResult,
            trackId,
            'native_range',
            'foreground'
          );
          if (validResult) return validResult;
        }
      } catch (error) {
        recordDownloadDiagnostic(spotifyId, 'audio.failed', {
          transport: 'native_range',
          session: 'foreground',
          error: errorMessage(error),
        });
        console.warn(
          `[DownloadManager] Native range transfer failed from ${audioUrlOrigin(audioUrl)}: ${errorMessage(error)}. Trying Expo fallback.`
        );
      }
    }

    // 2. Direct progressive download via createDownloadResumable
    try {
      recordDownloadDiagnostic(spotifyId, 'audio.request', {
        method: 'GET',
        transport: 'resumable',
        session: 'background',
        url: audioUrl,
        format: cleanFormat,
        range: headers?.Range,
      });
      const downloadResumable = FileSystem.createDownloadResumable(
        audioUrl,
        localPath,
        {
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          ...(headers ? { headers } : {}),
        },
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          onProgress?.(isNaN(progress) ? 0 : progress);
        }
      );
      activeResumables.set(trackId, downloadResumable);

      const result = await downloadResumable.downloadAsync();
      const validResult = await validateDownloadedAudio(
        { ...result, sourceUrl: audioUrl },
        trackId,
        'resumable',
        'background'
      );
      if (validResult) return validResult;
    } catch (error) {
      recordDownloadDiagnostic(spotifyId, 'audio.failed', {
        transport: 'resumable',
        session: 'background',
        error: errorMessage(error),
      });
      console.warn(
        `[DownloadManager] Resumable download failed from ${audioUrlOrigin(audioUrl)}: ${errorMessage(error)}. Trying direct download.`
      );
    }

    // 3. Fallback to FileSystem.downloadAsync
    try {
      recordDownloadDiagnostic(spotifyId, 'audio.request', {
        method: 'GET',
        transport: 'direct',
        session: 'background',
        url: audioUrl,
        format: cleanFormat,
        range: headers?.Range,
      });
      const directResult = await FileSystem.downloadAsync(audioUrl, localPath, {
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
        ...(headers ? { headers } : {}),
      });
      const validResult = await validateDownloadedAudio(
        { ...directResult, sourceUrl: audioUrl },
        trackId,
        'direct',
        'background'
      );
      if (validResult) return validResult;
    } catch (error) {
      recordDownloadDiagnostic(spotifyId, 'audio.failed', {
        transport: 'direct',
        session: 'background',
        error: errorMessage(error),
      });
      console.warn(
        `[DownloadManager] Direct download failed from ${audioUrlOrigin(audioUrl)}: ${errorMessage(error)}`
      );
    }

    // iOS background URLSession may defer a short-lived signed stream until it
    // expires. A foreground retry starts while the user still has the sheet open.
    if (Platform.OS === 'ios') {
      try {
        recordDownloadDiagnostic(spotifyId, 'audio.request', {
          method: 'GET',
          transport: 'direct',
          session: 'foreground',
          url: audioUrl,
          format: cleanFormat,
          range: headers?.Range,
        });
        const directResult = await FileSystem.downloadAsync(audioUrl, localPath, {
          sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
          ...(headers ? { headers } : {}),
        });
        const validResult = await validateDownloadedAudio(
          { ...directResult, sourceUrl: audioUrl },
          trackId,
          'direct',
          'foreground'
        );
        if (validResult) return validResult;
      } catch (error) {
        recordDownloadDiagnostic(spotifyId, 'audio.failed', {
          transport: 'direct',
          session: 'foreground',
          error: errorMessage(error),
        });
        console.warn(
          `[DownloadManager] Foreground download failed from ${audioUrlOrigin(audioUrl)}: ${errorMessage(error)}`
        );
      }
    }

    const fetchResult = await downloadAudioWithFetch(
      audioUrl,
      localPath,
      trackId,
      cleanFormat
    );
    if (fetchResult) return fetchResult;

    recordDownloadDiagnostic(spotifyId, 'audio.exhausted', { url: audioUrl });
    return null;
  } catch (error) {
    recordDownloadDiagnostic(diagnosticsIdFromTrackId(trackId), 'audio.failed', {
      error: errorMessage(error),
    });
    console.error('[DownloadManager] Audio download failed:', error);
    return null;
  }
};

/**
 * Download cover image from URL to local storage
 */
export const downloadCover = async (
  imageUrl: string,
  trackId: string
): Promise<string | null> => {
  if (!imageUrl) return null;
  if (Platform.OS === 'web') return imageUrl;

  try {
    await ensureDirectories();
    const localPath = `${COVERS_DIR}${trackId}.jpg`;

    const result = await FileSystem.downloadAsync(imageUrl, localPath, {
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    });
    return result.uri;
  } catch (error) {
    console.error('[DownloadManager] Cover download failed:', error);
    return null;
  }
};

/**
 * Full download pipeline: audio + cover + lyrics + metadata
 */
const downloadTrackInternal = async (
  track: DownloadTrackInput,
  audioUrl?: string,
  audioFormat: string = 'mp3',
  onProgress?: (progress: number) => void
): Promise<DownloadedTrack | null> => {
  try {
    if (cancelledDownloads.has(track.spotifyId)) return null;
    await startDownloadDiagnostics(track);
    recordDownloadDiagnostic(track.spotifyId, 'download.queued', {
      hasSuppliedAudioUrl: Boolean(audioUrl || track.audioUrl),
      format: audioFormat || track.audioFormat || 'mp3',
    });
    await upsertPendingDownload(
      track,
      audioUrl || track.audioUrl,
      audioFormat || track.audioFormat || 'mp3'
    );
    const trackId = `track_${track.spotifyId}`;
    let effectiveTrack = track;

    const suppliedAudioUrl = audioUrl || track.audioUrl;
    // A cached signed URL may expire while a native background task waits.
    // Native asks the shared resolver for a fresh source; web can reuse its
    // already-proxied source without triggering an extra request.
    let resolvedUrl = Platform.OS === 'web' ? suppliedAudioUrl : undefined;
    let format = Platform.OS === 'web'
      ? audioFormat || track.audioFormat || 'mp3'
      : 'mp3';
    let youtubeVideoId: string | undefined;
    if (resolvedUrl) {
      resolvedUrl = getPlayableAudioUrl(resolvedUrl);
      recordDownloadDiagnostic(track.spotifyId, 'audio.source.preloaded', {
        url: resolvedUrl,
        format,
      });
    }

    // Audio is resolved on the current device by default. A server is only an
    // explicit legacy fallback when EXPO_PUBLIC_LOCAL_AUDIO_ONLY is false.
    if (!resolvedUrl) {
      recordDownloadDiagnostic(track.spotifyId, 'audio.resolve.request', {
        platform: Platform.OS,
      });
      console.log(
        `[DownloadManager] ${Platform.OS} resolving "${track.artistName} - ${track.title}", ${LOCAL_AUDIO_ONLY ? 'mode: local' : `backend: ${MUSIC_SERVER_URL || 'unavailable'}`}`
      );
      const mainResult = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );
      // Imported metadata can retain an obsolete or provider-specific id.
      // The second pass deliberately resolves only the canonical title/artist
      // so downloads never fail solely because that id no longer has a stream.
      const fallbackResult =
        mainResult?.url || !track.spotifyId
          ? mainResult
          : await resolveAudioUrl(
              track.title,
              track.artistName,
              undefined,
              track.duration_ms
            );
      if (fallbackResult?.url) {
        resolvedUrl = fallbackResult.url;
        format = fallbackResult.format || 'mp3';
        youtubeVideoId = fallbackResult.videoId;
        recordDownloadDiagnostic(track.spotifyId, 'audio.source.resolved', {
          url: resolvedUrl,
          format,
          source: fallbackResult.source,
          videoId: youtubeVideoId,
        });
        if (!effectiveTrack.imageURL && fallbackResult.imageURL) {
          effectiveTrack = {
            ...effectiveTrack,
            imageURL: fallbackResult.imageURL,
          };
          await upsertPendingDownload(effectiveTrack, resolvedUrl, format);
        }
        await upsertPendingDownload(effectiveTrack, resolvedUrl, format);
      }
    }

    if (!resolvedUrl && suppliedAudioUrl) {
      resolvedUrl = getPlayableAudioUrl(suppliedAudioUrl);
      format = audioFormat || track.audioFormat || 'mp3';
      recordDownloadDiagnostic(track.spotifyId, 'audio.source.fallback', {
        url: resolvedUrl,
        format,
      });
    }

    if (cancelledDownloads.has(track.spotifyId)) return null;

    if (!resolvedUrl) {
      console.warn(
        `[DownloadManager] No verified stream for "${track.artistName} - ${track.title}". ${LOCAL_AUDIO_ONLY ? 'Check the device connection and retry.' : `Check backend logs at ${MUSIC_SERVER_URL || 'unavailable'}.`}`
      );
      throw new Error('Could not resolve audio stream URL');
    }

    // Download audio file
    let localAudioPath = await downloadAudio(
      resolvedUrl,
      trackId,
      format,
      (p) => onProgress?.(p * 0.7),
      youtubeVideoId
    );

    if (cancelledDownloads.has(track.spotifyId)) return null;

    // Stream URLs can expire while the OS waits to run a background task.
    // Resolve once more before marking the queued item as failed.
    if (!localAudioPath) {
      recordDownloadDiagnostic(track.spotifyId, 'audio.resolve.refresh');
      const refreshed = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms,
        undefined,
        true
      );
      if (refreshed?.url && refreshed.url !== resolvedUrl) {
        resolvedUrl = refreshed.url;
        format = refreshed.format || format;
        youtubeVideoId = refreshed.videoId;
        recordDownloadDiagnostic(track.spotifyId, 'audio.source.refreshed', {
          url: resolvedUrl,
          format,
          source: refreshed.source,
          videoId: youtubeVideoId,
        });
        await upsertPendingDownload(track, resolvedUrl, format);
        localAudioPath = await downloadAudio(
          resolvedUrl,
          trackId,
          format,
          (p) => onProgress?.(p * 0.7),
          youtubeVideoId
        );
      }
    }

    if (!localAudioPath) {
      throw new Error('Audio file download failed to produce valid local file');
    }

    onProgress?.(0.75);

    // Download cover art
    let localImagePath = effectiveTrack.imageURL;
    if (effectiveTrack.imageURL && effectiveTrack.imageURL.startsWith('http')) {
      const downloadedCoverUri = await downloadCover(effectiveTrack.imageURL, trackId);
      if (downloadedCoverUri) {
        localImagePath = downloadedCoverUri;
      }
    }

    onProgress?.(0.9);

    const downloadedTrack: DownloadedTrack = {
      id: trackId,
      spotifyId: effectiveTrack.spotifyId,
      title: effectiveTrack.title,
      artistName: effectiveTrack.artistName,
      albumName: effectiveTrack.albumName,
      imageURL: localImagePath || effectiveTrack.imageURL,
      localAudioPath,
      localImagePath: localImagePath || track.imageURL,
      downloadedAt: new Date().toISOString(),
      duration_ms: effectiveTrack.duration_ms,
      audioUrl: resolvedUrl,
    };

    // Save lyrics in background
    fetchLyrics(
      track.title,
      track.artistName,
      track.duration_ms ? track.duration_ms / 1000 : undefined,
      track.albumName
    )
      .then((lyrics) => {
        if (lyrics) {
          saveLyricsOffline(track.spotifyId, lyrics);
        }
      })
      .catch(() => {});

    // Save to AsyncStorage
    await updateDownloadedTracks((existingTracks) => [
      ...existingTracks.filter(
        (candidate) => candidate.spotifyId !== track.spotifyId
      ),
      downloadedTrack,
    ]);
    await removePendingDownload(track.spotifyId);

    onProgress?.(1.0);
    recordDownloadDiagnostic(track.spotifyId, 'download.completed');
    console.log(`[DownloadManager] Successfully downloaded track "${track.title}" to ${localAudioPath}`);
    return downloadedTrack;
  } catch (error) {
    if (cancelledDownloads.has(track.spotifyId)) return null;
    recordDownloadDiagnostic(track.spotifyId, 'download.failed', {
      error: errorMessage(error),
    });
    try {
      await recordPendingDownloadFailure(track.spotifyId);
    } catch {}
    console.error(
      `[DownloadManager] ${Platform.OS} download failed for "${track.artistName} - ${track.title}": ${errorMessage(error)}`
    );
    return null;
  }
};

/**
 * Downloads a track while persisting enough context to resume it in the next
 * system-scheduled background window if the app is suspended mid-transfer.
 */
export const downloadTrack = (
  track: DownloadTrackInput,
  audioUrl?: string,
  audioFormat: string = 'mp3',
  onProgress?: (progress: number) => void
): Promise<DownloadedTrack | null> => {
  const active = activeDownloads.get(track.spotifyId);
  if (active) return active;

  cancelledDownloads.delete(track.spotifyId);
  const request = downloadTrackInternal(
    track,
    audioUrl,
    audioFormat,
    onProgress
  );
  activeDownloads.set(track.spotifyId, request);
  request
    .finally(() => {
      activeDownloads.delete(track.spotifyId);
      activeResumables.delete(`track_${track.spotifyId}`);
      cancelledDownloads.delete(track.spotifyId);
    })
    .catch(() => {});
  return request;
};

/**
 * Processes persisted downloads after Expo wakes the app in a background task.
 * The OS owns scheduling, so this is deliberately bounded and idempotent.
 */
export const processPendingDownloads = async (
  maxDownloads = 1
): Promise<{ completed: number; failed: number }> => {
  const pending = await getPendingDownloads();
  let completed = 0;
  let failed = 0;

  const eligible = pending.filter(canRetryPendingDownload);
  for (const candidate of eligible.slice(0, Math.max(1, maxDownloads))) {
    if (await isTrackDownloaded(candidate.track.spotifyId)) {
      await removePendingDownload(candidate.track.spotifyId);
      completed += 1;
      continue;
    }

    const downloaded = await downloadTrack(
      candidate.track,
      candidate.audioUrl,
      candidate.audioFormat
    );
    if (downloaded) {
      completed += 1;
    } else {
      failed += 1;
    }
  }

  return { completed, failed };
};

/**
 * Delete a downloaded track from local storage
 */
export const deleteDownloadedTrack = async (
  spotifyId: string
): Promise<boolean> => {
  try {
    const tracks = await getDownloadedTracks();
    const track = tracks.find((t) => t.spotifyId === spotifyId);

    if (!track) return false;

    if (Platform.OS !== 'web') {
      if (track.localAudioPath?.startsWith('file:')) {
        const audioInfo = await FileSystem.getInfoAsync(track.localAudioPath);
        if (audioInfo.exists) {
          await FileSystem.deleteAsync(track.localAudioPath, { idempotent: true });
        }
      }

      if (track.localImagePath?.startsWith('file:')) {
        const imageInfo = await FileSystem.getInfoAsync(track.localImagePath);
        if (imageInfo.exists) {
          await FileSystem.deleteAsync(track.localImagePath, { idempotent: true });
        }
      }
    }

    await updateDownloadedTracks((currentTracks) =>
      currentTracks.filter((candidate) => candidate.spotifyId !== spotifyId)
    );
    return true;
  } catch (error) {
    console.error('[DownloadManager] Failed to delete downloaded track:', error);
    return false;
  }
};
