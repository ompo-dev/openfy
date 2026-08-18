/**
 * Download Manager Service
 * Handles downloading audio files and cover art to device local storage
 * Uses expo-file-system for all file operations
 */

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchLyrics, saveLyricsOffline } from '../lyrics/lyricsService';

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
 * Download audio file from URL to local storage
 */
export const downloadAudio = async (
  audioUrl: string,
  trackId: string,
  format: string = 'm4a',
  onProgress?: (progress: number) => void
): Promise<string | null> => {
  try {
    await ensureDirectories();
    const localPath = `${DOWNLOADS_DIR}${trackId}.${format}`;

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
    if (!result) return null;

    return result.uri;
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

import { resolveAudioUrl } from '../audio/audioResolver';

/**
 * Full download pipeline: audio + cover + save metadata
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
    let resolvedUrl = audioUrl;
    let format = audioFormat;

    if (!resolvedUrl) {
      const resolved = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );
      if (!resolved?.url) {
        throw new Error('Could not resolve audio URL');
      }
      resolvedUrl = resolved.url;
      format = resolved.format || 'mp3';
    }

    const trackId = `track_${track.spotifyId}`;

    // Download audio (70% of progress)
    const localAudioPath = await downloadAudio(
      resolvedUrl,
      trackId,
      format,
      (p) => onProgress?.(p * 0.7)
    );

    if (!localAudioPath) {
      throw new Error('Audio download failed');
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
      audioUrl,
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
      await FileSystem.deleteAsync(track.localAudioPath);
    }

    // Delete cover file
    const coverInfo = await FileSystem.getInfoAsync(track.localImagePath);
    if (coverInfo.exists) {
      await FileSystem.deleteAsync(track.localImagePath);
    }

    // Remove from storage
    const filtered = tracks.filter((t) => t.spotifyId !== spotifyId);
    await saveDownloadedTracks(filtered);

    return true;
  } catch (error) {
    console.error('[DownloadManager] Delete failed:', error);
    return false;
  }
};
