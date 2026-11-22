import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/** Downloads survive app updates, but absolute iOS sandbox URLs may not. */
export const managedDownloadFilename = (uri?: string): string | null => {
  if (!uri?.startsWith('file:')) return null;
  const marker = '/openfy_downloads/';
  const index = uri.lastIndexOf(marker);
  if (index < 0) return null;
  const name = uri.slice(index + marker.length);
  return name && name !== '.' && name !== '..' && !/[/\\?#]/.test(name) ? name : null;
};

export const currentManagedAudioPath = (uri?: string): string | null => {
  const filename = managedDownloadFilename(uri);
  return filename && FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}openfy_downloads/${filename}` : null;
};

/** Never treat remote links or a zero-byte file as an offline recording. */
export const getExistingLocalAudioPath = async (uri?: string): Promise<string | null> => {
  if (Platform.OS === 'web' || !uri?.startsWith('file:') || uri.endsWith('.m3u8')) return null;
  const candidates = [currentManagedAudioPath(uri), uri];
  for (const candidate of new Set(candidates)) {
    if (!candidate) continue;
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      if (info.exists && (info.size === undefined || info.size > 5_000)) return candidate;
    } catch { /* The old sandbox path may no longer exist after an update. */ }
  }
  return null;
};
