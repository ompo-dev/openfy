import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'openfy_artist_image:';
const imageCache = new Map<string, string>();
const missingImageCache = new Set<string>();
const pendingImageLoads = new Map<string, Promise<string>>();

const getArtistCacheId = (artistName: string) =>
  artistName.trim().toLocaleLowerCase();

const isRemoteImage = (value: string) => /^https?:\/\//i.test(value);

/** Keeps artist URLs across launches; Expo Image stores the image bytes on disk. */
export const getCachedArtistImage = async (
  artistName: string,
  loadImage: () => Promise<string>
): Promise<string> => {
  const id = getArtistCacheId(artistName);
  if (!id) return '';

  const cached = imageCache.get(id);
  if (cached) return cached;
  if (missingImageCache.has(id)) return '';

  const pending = pendingImageLoads.get(id);
  if (pending) return pending;

  const request = (async () => {
    try {
      const stored = await AsyncStorage.getItem(
        `${STORAGE_KEY_PREFIX}${encodeURIComponent(id)}`
      );
      if (stored && isRemoteImage(stored)) {
        imageCache.set(id, stored);
        return stored;
      }
    } catch {}

    const imageURL = await loadImage().catch(() => '');
    if (!isRemoteImage(imageURL)) {
      missingImageCache.add(id);
      return '';
    }

    imageCache.set(id, imageURL);
    try {
      await AsyncStorage.setItem(
        `${STORAGE_KEY_PREFIX}${encodeURIComponent(id)}`,
        imageURL
      );
    } catch {}
    return imageURL;
  })();

  pendingImageLoads.set(id, request);
  try {
    return await request;
  } finally {
    pendingImageLoads.delete(id);
  }
};
