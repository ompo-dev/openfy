/**
 * Download Manager Service
 * Handles downloading audio files (both progressive MP3/M4A and assembled HLS .m3u8 streams)
 * and cover art to device local storage for 100% offline playback.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchLyrics, saveLyricsOffline } from '../lyrics/lyricsService';
import {
  getPlayableAudioUrl,
  resolveAudioUrl,
  resolveViaSoundCloud,
  resolveViaYouTubeTopic,
} from '../audio/audioResolver';

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
  onProgress?: (progress: number) => void
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

    // 1. If HLS .m3u8 playlist
    if (audioUrl.includes('.m3u8')) {
      console.log('[DownloadManager] Downloading HLS stream to local MP3...');
      const hlsResult = await downloadHlsAudio(audioUrl, localPath, onProgress);
      if (hlsResult) return hlsResult;
    }

    // 2. Direct progressive download via createDownloadResumable
    try {
      const downloadResumable = FileSystem.createDownloadResumable(
        audioUrl,
        localPath,
        { sessionType: FileSystem.FileSystemSessionType.BACKGROUND },
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          onProgress?.(isNaN(progress) ? 0 : progress);
        }
      );
      activeResumables.set(trackId, downloadResumable);

      const result = await downloadResumable.downloadAsync();
      if (result?.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        if (fileInfo.exists && fileInfo.size && fileInfo.size > 50000) {
          return result.uri;
        }
      }
    } catch {
      // Fallback
    }

    // 3. Fallback to FileSystem.downloadAsync
    try {
      const directResult = await FileSystem.downloadAsync(audioUrl, localPath, {
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      });
      if (directResult?.uri) {
        const fileInfo = await FileSystem.getInfoAsync(directResult.uri);
        if (fileInfo.exists && fileInfo.size && fileInfo.size > 50000) {
          return directResult.uri;
        }
      }
    } catch {}

    return null;
  } catch (error) {
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
    await upsertPendingDownload(
      track,
      audioUrl || track.audioUrl,
      audioFormat || track.audioFormat || 'mp3'
    );
    const trackId = `track_${track.spotifyId}`;
    let effectiveTrack = track;

    // iOS can begin a background download after provider signatures expire.
    // Resolve a fresh proxied stream at execution time on that platform.
    let resolvedUrl = Platform.OS === 'ios' ? undefined : audioUrl || track.audioUrl;
    let format = audioFormat || track.audioFormat || 'mp3';
    if (resolvedUrl) {
      resolvedUrl = getPlayableAudioUrl(resolvedUrl, track.spotifyId);
    }

    // If no URL provided, resolve audio source
    if (!resolvedUrl) {
      console.log(`[DownloadManager] Resolving audio for: "${track.artistName} - ${track.title}"`);
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

    if (cancelledDownloads.has(track.spotifyId)) return null;

    if (!resolvedUrl) {
      throw new Error('Could not resolve audio stream URL');
    }

    // Download audio file
    let localAudioPath = await downloadAudio(
      resolvedUrl,
      trackId,
      format,
      (p) => onProgress?.(p * 0.7)
    );

    if (cancelledDownloads.has(track.spotifyId)) return null;

    // Stream URLs can expire while the OS waits to run a background task.
    // Resolve once more before marking the queued item as failed.
    if (!localAudioPath && (audioUrl || track.audioUrl)) {
      const refreshed = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );
      if (refreshed?.url && refreshed.url !== resolvedUrl) {
        resolvedUrl = refreshed.url;
        format = refreshed.format || format;
        await upsertPendingDownload(track, resolvedUrl, format);
        localAudioPath = await downloadAudio(
          resolvedUrl,
          trackId,
          format,
          (p) => onProgress?.(p * 0.7)
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
    console.log(`[DownloadManager] Successfully downloaded track "${track.title}" to ${localAudioPath}`);
    return downloadedTrack;
  } catch (error) {
    if (cancelledDownloads.has(track.spotifyId)) return null;
    try {
      await recordPendingDownloadFailure(track.spotifyId);
    } catch {}
    console.error('[DownloadManager] Track download failed:', error);
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
