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

const DOWNLOADS_STORAGE_KEY = 'openfy_downloads';
const DOWNLOADS_DIR = `${FileSystem.documentDirectory || ''}openfy_downloads/`;
const COVERS_DIR = `${FileSystem.documentDirectory || ''}openfy_covers/`;

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
        {},
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          onProgress?.(isNaN(progress) ? 0 : progress);
        }
      );

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
      const directResult = await FileSystem.downloadAsync(audioUrl, localPath);
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

    const result = await FileSystem.downloadAsync(imageUrl, localPath);
    return result.uri;
  } catch (error) {
    console.error('[DownloadManager] Cover download failed:', error);
    return null;
  }
};

/**
 * Full download pipeline: audio + cover + lyrics + metadata
 */
export const downloadTrack = async (
  track: {
    spotifyId: string;
    title: string;
    artistName: string;
    albumName: string;
    imageURL: string;
    duration_ms: number;
  },
  audioUrl?: string,
  audioFormat: string = 'mp3',
  onProgress?: (progress: number) => void
): Promise<DownloadedTrack | null> => {
  try {
    const trackId = `track_${track.spotifyId}`;

    let resolvedUrl = audioUrl;
    let format = audioFormat;

    // If no URL provided, resolve audio source
    if (!resolvedUrl) {
      console.log(`[DownloadManager] Resolving audio for: "${track.artistName} - ${track.title}"`);
      const mainResult = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );
      if (mainResult?.url) {
        resolvedUrl = mainResult.url;
        format = mainResult.format || 'mp3';
      }
    }

    if (!resolvedUrl) {
      throw new Error('Could not resolve audio stream URL');
    }

    // Download audio file
    const localAudioPath = await downloadAudio(
      resolvedUrl,
      trackId,
      format,
      (p) => onProgress?.(p * 0.7)
    );

    if (!localAudioPath) {
      throw new Error('Audio file download failed to produce valid local file');
    }

    onProgress?.(0.75);

    // Download cover art
    let localImagePath = track.imageURL;
    if (track.imageURL && track.imageURL.startsWith('http')) {
      const downloadedCoverUri = await downloadCover(track.imageURL, trackId);
      if (downloadedCoverUri) {
        localImagePath = downloadedCoverUri;
      }
    }

    onProgress?.(0.9);

    const downloadedTrack: DownloadedTrack = {
      id: trackId,
      spotifyId: track.spotifyId,
      title: track.title,
      artistName: track.artistName,
      albumName: track.albumName,
      imageURL: localImagePath || track.imageURL,
      localAudioPath,
      localImagePath: localImagePath || track.imageURL,
      downloadedAt: new Date().toISOString(),
      duration_ms: track.duration_ms,
      audioUrl: resolvedUrl,
    };

    // Save lyrics in background
    fetchLyrics(
      track.title,
      track.artistName,
      track.duration_ms ? track.duration_ms / 1000 : undefined
    )
      .then((lyrics) => {
        if (lyrics) {
          saveLyricsOffline(track.spotifyId, lyrics);
        }
      })
      .catch(() => {});

    // Save to AsyncStorage
    const existingTracks = await getDownloadedTracks();
    const filtered = existingTracks.filter(
      (t) => t.spotifyId !== track.spotifyId
    );
    await saveDownloadedTracks([...filtered, downloadedTrack]);

    onProgress?.(1.0);
    console.log(`[DownloadManager] Successfully downloaded track "${track.title}" to ${localAudioPath}`);
    return downloadedTrack;
  } catch (error) {
    console.error('[DownloadManager] Track download failed:', error);
    return null;
  }
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

    const filtered = tracks.filter((t) => t.spotifyId !== spotifyId);
    await saveDownloadedTracks(filtered);
    return true;
  } catch (error) {
    console.error('[DownloadManager] Failed to delete downloaded track:', error);
    return false;
  }
};
