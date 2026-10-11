import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { prefetchImage } from '../images/imagePrefetch';
import { artistIdentityKey } from '../search/artistIdentity';

const STORAGE_KEY_PREFIX = 'openfy_artist_image_verified_v7:';
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
  const identities = aliases.map(artistIdentityKey).filter(Boolean);
  const channels = identities.filter((id) => id.startsWith('youtube:'));
  return [...new Set(channels.length ? channels : identities.length ? identities
    : [artistName, ...aliases].map(getArtistCacheId).filter(Boolean))];
};
const getSpotifyArtistAlias = (aliases: string[]) =>
  aliases.find((alias) => /^[A-Za-z0-9]{22}$/.test(alias)) || '';
const getYouTubeArtistAlias = (aliases: string[]) =>
  aliases.find((alias) => alias.startsWith('ytartist_') || /^UC[\w-]{22}$/.test(alias)) || '';
const youtubeCacheKey = (alias: string) => artistIdentityKey(alias) || `legacy:${alias}`;

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
  const youtubeArtistId = getYouTubeArtistAlias(aliases);
  const spotifyArtistId = youtubeArtistId ? '' : getSpotifyArtistAlias(aliases);
  if (spotifyArtistId) {
    imageCache.set(`spotify:${spotifyArtistId}`, imageURL, IMAGE_CACHE_TTL_MS);
  }
  if (youtubeArtistId) {
    imageCache.set(youtubeCacheKey(youtubeArtistId), imageURL, IMAGE_CACHE_TTL_MS);
  }
  try {
    const entries = cacheIds.map((cacheId) => [
      `${STORAGE_KEY_PREFIX}${encodeURIComponent(cacheId)}`,
      imageURL,
    ] as [string, string]);
    if (spotifyArtistId) {
      entries.push([
        `${STORAGE_KEY_PREFIX}${encodeURIComponent(`spotify:${spotifyArtistId}`)}`,
        imageURL,
      ]);
    }
    if (youtubeArtistId) {
      entries.push([
        `${STORAGE_KEY_PREFIX}${encodeURIComponent(youtubeCacheKey(youtubeArtistId))}`,
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
  const youtubeArtistId = getYouTubeArtistAlias(aliases);
  const spotifyArtistId = youtubeArtistId ? '' : getSpotifyArtistAlias(aliases);
  const cacheKey = spotifyArtistId
    ? `spotify:${spotifyArtistId}`
    : youtubeArtistId
      ? youtubeCacheKey(youtubeArtistId)
      : cacheIds[0] || id;
  const storageIds = spotifyArtistId
    ? [`spotify:${spotifyArtistId}`]
    : youtubeArtistId
      ? [youtubeCacheKey(youtubeArtistId)]
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
