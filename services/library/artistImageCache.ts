import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';

const STORAGE_KEY_PREFIX = 'openfy_artist_image_verified_v2:';
const IMAGE_CACHE_TTL_MS = 6 * 60 * 60_000;
const MISSING_IMAGE_CACHE_TTL_MS = 60_000;
const imageCache = createAsyncResourceCache<string>({
  name: 'artist-image',
  category: 'artist',
  maxEntries: 250,
  ttlFor: (imageURL) => imageURL ? IMAGE_CACHE_TTL_MS : MISSING_IMAGE_CACHE_TTL_MS,
});

const getArtistCacheId = (artistName: string) =>
  artistName.trim().toLocaleLowerCase();

const isRemoteImage = (value: string) => /^https?:\/\//i.test(value);

export const rememberCachedArtistImage = async (artistName: string, imageURL: string) => {
  const id = getArtistCacheId(artistName);
  if (!id || !isRemoteImage(imageURL)) return;
  imageCache.set(id, imageURL, IMAGE_CACHE_TTL_MS);
  try {
    await AsyncStorage.setItem(
      `${STORAGE_KEY_PREFIX}${encodeURIComponent(id)}`,
      imageURL
    );
  } catch {}
};

/** Keeps artist URLs across launches; Expo Image stores the image bytes on disk. */
export const getCachedArtistImage = async (
  artistName: string,
  loadImage: () => Promise<string | null>
): Promise<string> => {
  const id = getArtistCacheId(artistName);
  if (!id) return '';

  return imageCache.getOrLoad(id, async () => {
    try {
      const stored = await AsyncStorage.getItem(
        `${STORAGE_KEY_PREFIX}${encodeURIComponent(id)}`
      );
      if (stored && isRemoteImage(stored)) return stored;
    } catch {}

    const imageURL = await loadImage().catch(() => '') || '';
    if (!isRemoteImage(imageURL)) return '';

    await rememberCachedArtistImage(id, imageURL);
    return imageURL;
  }, IMAGE_CACHE_TTL_MS);
};

/** Clears only the process cache; persisted artist artwork remains intact. */
export const _clearArtistImageMemoryCacheForTests = () => imageCache.clear();
