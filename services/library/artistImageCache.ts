import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { prefetchImage } from '../images/imagePrefetch';
import { parseYouTubeMusicArtistRoute } from '../youtubeMusicClient';

const STORAGE_KEY_PREFIX = 'openfy_artist_image_verified_v5:';
const IMAGE_CACHE_TTL_MS = 6 * 60 * 60_000;
const MISSING_IMAGE_CACHE_TTL_MS = 60_000;
const imageCache = createAsyncResourceCache<string>({
  name: 'artist-image',
  category: 'artist',
  maxEntries: 250,
  ttlFor: (imageURL) => imageURL ? IMAGE_CACHE_TTL_MS : MISSING_IMAGE_CACHE_TTL_MS,
});

const getArtistCacheId = (artistName: string) => artistName
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

const isRemoteImage = (value: string) => /^https?:\/\//i.test(value);

const uniqueCacheIds = (artistName: string, aliases: string[] = []) => {
  const identities = aliases.filter((alias) => /^[A-Za-z0-9]{22}$/.test(alias) ||
    /^UC[\w-]{22}$/.test(alias) || (alias.startsWith('ytartist_') && Boolean(parseYouTubeMusicArtistRoute(alias).browseId)));
  return [...new Set((identities.length ? identities : [artistName, ...aliases]).map(getArtistCacheId).filter(Boolean))];
};
const getSpotifyArtistAlias = (aliases: string[]) =>
  aliases.find((alias) => /^[A-Za-z0-9]{22}$/.test(alias)) || '';
const getYouTubeArtistAlias = (aliases: string[]) =>
  aliases.find((alias) => alias.startsWith('ytartist_')) || '';

export const rememberCachedArtistImage = async (
  artistName: string,
  imageURL: string,
  aliases: string[] = []
) => {
  const id = getArtistCacheId(artistName);
  if (!id || !isRemoteImage(imageURL)) return;
  void prefetchImage(imageURL);
  const cacheIds = uniqueCacheIds(artistName, aliases);
  cacheIds.forEach((cacheId) => imageCache.set(cacheId, imageURL, IMAGE_CACHE_TTL_MS));
  const spotifyArtistId = getSpotifyArtistAlias(aliases);
  const youtubeArtistId = getYouTubeArtistAlias(aliases);
  if (spotifyArtistId) {
    imageCache.set(`spotify:${spotifyArtistId}`, imageURL, IMAGE_CACHE_TTL_MS);
  }
  if (youtubeArtistId) {
    imageCache.set(`youtube:${youtubeArtistId}`, imageURL, IMAGE_CACHE_TTL_MS);
  }
  try {
    const entries = cacheIds.map((cacheId) => [
      `${STORAGE_KEY_PREFIX}${encodeURIComponent(cacheId)}`,
      imageURL,
    ] as [string, string]);
    if (youtubeArtistId) {
      entries.push([
        `${STORAGE_KEY_PREFIX}${encodeURIComponent(`youtube:${youtubeArtistId}`)}`,
        imageURL,
      ]);
    }
    await AsyncStorage.multiSet(entries);
  } catch {}
};

/** Keeps artist URLs across launches; Expo Image stores the image bytes on disk. */
export const getCachedArtistImage = async (
  artistName: string,
  loadImage: () => Promise<string | null>,
  aliases: string[] = []
): Promise<string> => {
  const id = getArtistCacheId(artistName);
  if (!id) return '';
  const cacheIds = uniqueCacheIds(artistName, aliases);
  const spotifyArtistId = getSpotifyArtistAlias(aliases);
  const youtubeArtistId = getYouTubeArtistAlias(aliases);
  const cacheKey = spotifyArtistId
    ? `spotify:${spotifyArtistId}`
    : youtubeArtistId
      ? `youtube:${youtubeArtistId}`
      : id;
  const storageIds = spotifyArtistId
    ? [spotifyArtistId]
    : youtubeArtistId
      ? [`youtube:${youtubeArtistId}`, youtubeArtistId]
      : cacheIds;

  const imageURL = await imageCache.getOrLoad(cacheKey, async () => {
    try {
      const stored = await AsyncStorage.multiGet(storageIds.map((cacheId) =>
        `${STORAGE_KEY_PREFIX}${encodeURIComponent(cacheId)}`
      ));
      const persistedURL = stored.find(([, value]) => value && isRemoteImage(value))?.[1];
      if (persistedURL) {
        await rememberCachedArtistImage(artistName, persistedURL, aliases);
        return persistedURL;
      }
    } catch {}

    const imageURL = await loadImage().catch(() => '') || '';
    if (!isRemoteImage(imageURL)) return '';

    await rememberCachedArtistImage(artistName, imageURL, aliases);
    return imageURL;
  }, IMAGE_CACHE_TTL_MS);
  void prefetchImage(imageURL);
  return imageURL;
};

/** Clears only the process cache; persisted artist artwork remains intact. */
export const _clearArtistImageMemoryCacheForTests = () => imageCache.clear();
