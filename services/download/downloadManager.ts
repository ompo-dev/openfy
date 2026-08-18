/**
 * Download Manager Service
 * Handles downloading audio files and cover art to device local storage.
 * Ensures 100% progressive MP3/M4A binary file download (avoiding HLS .m3u8 manifests).
 */

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchLyrics, saveLyricsOffline } from '../lyrics/lyricsService';
import {
  resolveAudioUrl,
  resolveViaSoundCloud,
  resolveViaSpotyloader,
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
const DOWNLOADS_DIR = `${FileSystem.documentDirectory}openfy_downloads/`;
const COVERS_DIR = `${FileSystem.documentDirectory}openfy_covers/`;

/**
 * Ensure download directories exist
 */
export const ensureDirectories = async (): Promise<void> => {
  const downloadsInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
  if (!downloadsInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
  }

  const coversInfo = await FileSystem.getInfoAsync(COVERS_DIR);
  if (!coversInfo.exists) {
    await FileSystem.makeDirectoryAsync(COVERS_DIR, { intermediates: true });
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
 * Download audio file from URL to local storage.
 * Automatically avoids HLS .m3u8 playlist manifests and verifies file size.
 */
export const downloadAudio = async (
  audioUrl: string,
  trackId: string,
  format: string = 'mp3',
  onProgress?: (progress: number) => void
): Promise<string | null> => {
  try {
    await ensureDirectories();
    const localPath = `${DOWNLOADS_DIR}${trackId}.${format}`;

    if (!audioUrl || audioUrl.includes('.m3u8')) {
      console.warn('[DownloadManager] HLS .m3u8 provided, skipping direct manifest download');
      return null;
    }

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
      // Fallback to direct downloadAsync
    }

    // Direct FileSystem.downloadAsync fallback
    const directResult = await FileSystem.downloadAsync(audioUrl, localPath);
    if (directResult?.uri) {
      const fileInfo = await FileSystem.getInfoAsync(directResult.uri);
      if (fileInfo.exists && fileInfo.size && fileInfo.size > 50000) {
        return directResult.uri;
      }
    }

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

    // If no progressive direct audio URL or if URL is .m3u8, resolve fresh progressive MP3
    if (!resolvedUrl || resolvedUrl.includes('.m3u8')) {
      console.log(`[DownloadManager] Resolving progressive audio for download: "${track.artistName} - ${track.title}"`);
      
      const scResult = await resolveViaSoundCloud(track.title, track.artistName, track.duration_ms);
      if (scResult?.url && !scResult.url.includes('.m3u8')) {
        resolvedUrl = scResult.url;
        format = 'mp3';
      } else {
        const spotyResult = await resolveViaSpotyloader(track.spotifyId);
        if (spotyResult?.url && !spotyResult.url.includes('.m3u8')) {
          resolvedUrl = spotyResult.url;
          format = 'mp3';
        } else {
          const ytResult = await resolveViaYouTubeTopic(track.title, track.artistName);
          if (ytResult?.url && !ytResult.url.includes('.m3u8')) {
            resolvedUrl = ytResult.url;
            format = 'm4a';
          } else {
            const mainResult = await resolveAudioUrl(track.title, track.artistName, track.spotifyId, track.duration_ms);
            if (mainResult?.url && !mainResult.url.includes('.m3u8')) {
              resolvedUrl = mainResult.url;
              format = mainResult.format || 'mp3';
            }
          }
        }
      }
    }

    if (!resolvedUrl || resolvedUrl.includes('.m3u8')) {
      throw new Error('Could not resolve progressive audio URL for download');
    }

    // Download audio file (70% of progress)
    let localAudioPath = await downloadAudio(
      resolvedUrl,
      trackId,
      format,
      (p) => onProgress?.(p * 0.7)
    );

    if (!localAudioPath) {
      throw new Error('Audio binary file download failed');
    }

    onProgress?.(0.75);

    // Download cover art
    const localImagePath =
      track.imageURL
        ? (await downloadCover(track.imageURL, trackId)) || track.imageURL
        : track.imageURL;

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

    // Delete audio file
    const audioInfo = await FileSystem.getInfoAsync(track.localAudioPath);
    if (audioInfo.exists) {
      await FileSystem.deleteAsync(track.localAudioPath, { idempotent: true });
    }

    // Delete cover file
    if (track.localImagePath && track.localImagePath.startsWith('file:')) {
      const imageInfo = await FileSystem.getInfoAsync(track.localImagePath);
      if (imageInfo.exists) {
        await FileSystem.deleteAsync(track.localImagePath, { idempotent: true });
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
