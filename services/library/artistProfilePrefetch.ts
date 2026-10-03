import { getCachedArtistImage } from './artistImageCache';
import { toYouTubeMusicArtistRouteId } from '../youtubeMusicClient';

const loadArtistApis = () => Promise.all([
  import('../../api/artists/artist'),
  import('../../api/artists/artistDiscography'),
  import('../../api/artists/artistTopTracks'),
  import('../../api/search/catalog'),
]).then(([artist, discography, topTracks, catalog]) => ({
  ...artist,
  ...discography,
  ...topTracks,
  ...catalog,
}));
let artistApisPromise: ReturnType<typeof loadArtistApis> | null = null;
const getArtistApis = () => {
  if (!artistApisPromise) {
    artistApisPromise = loadArtistApis().catch((error) => {
      artistApisPromise = null;
      throw error;
    });
  }
  return artistApisPromise;
};

type ArtistRef = { id?: string; name: string };
type TrackArtistData = {
  artistName: string;
  artists?: ArtistRef[];
};

const MAX_ACTIVE_ARTISTS = 5;
const activeArtistKeys = new Set<string>();
const activeProfiles = new Map<string, { spotifyId: string; youtubeRouteId: string }>();
const pendingPrefetches = new Map<string, Promise<void>>();

const normalize = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

const getTrackArtists = ({ artistName, artists }: TrackArtistData): ArtistRef[] => {
  const candidates: ArtistRef[] = artists?.length
    ? artists
    : artistName.split(/\s*(?:,|&| feat\.?)\s*/i).map((name) => ({ name }));
  const seen = new Set<string>();
  return candidates.filter((artist) => {
    const name = artist.name.trim();
    const key = artist.id || normalize(name);
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_ACTIVE_ARTISTS);
};

/** Warm only the current track's credited artists; request/result caches are bounded by their API owners. */
export const prefetchTrackArtistData = (track: TrackArtistData): void => {
  const artists = getTrackArtists(track);
  if (!artists.length) return;
  const artistApis = getArtistApis();
  const nextProfiles = new Map(artists.map((artist) => {
    const id = artist.id?.trim() || '';
    const spotifyId = /^[A-Za-z0-9]{22}$/.test(id) ? id : '';
    const youtubeRouteId = id.startsWith('ytartist_')
      ? id
      : toYouTubeMusicArtistRouteId(id.startsWith('UC') ? id : undefined, artist.name);
    return [spotifyId || youtubeRouteId, { spotifyId, youtubeRouteId }] as const;
  }));
  const nextKeys = new Set(nextProfiles.keys());

  activeProfiles.forEach((profile, key) => {
    if (nextKeys.has(key)) return;
    void artistApis.then((apis) => {
      if (profile.spotifyId) {
        apis.discardPrefetchedArtistProfile(profile.spotifyId);
        apis.discardPrefetchedArtistTopTracks(profile.spotifyId);
      }
      apis.discardPrefetchedYouTubeMusicArtistProfile(profile.youtubeRouteId);
    }).catch(() => {});
    activeProfiles.delete(key);
    activeArtistKeys.delete(key);
    pendingPrefetches.delete(key);
  });
  nextProfiles.forEach((profile, key) => {
    activeProfiles.set(key, profile);
    activeArtistKeys.add(key);
  });

  artists.forEach((artist) => {
    const name = artist.name.trim();
    const id = artist.id?.trim() || '';
    const spotifyId = /^[A-Za-z0-9]{22}$/.test(id) ? id : '';
    const youtubeRouteId = id.startsWith('ytartist_')
      ? id
      : toYouTubeMusicArtistRouteId(id.startsWith('UC') ? id : undefined, name);
    const cacheKey = spotifyId || youtubeRouteId;
    if (pendingPrefetches.has(cacheKey)) return;

    const request = artistApis.then(async (apis) => {
      const imageRequest = getCachedArtistImage(
        name,
        () => apis.getArtistCatalogImage(spotifyId || youtubeRouteId, name),
        [id, spotifyId, youtubeRouteId].filter(Boolean)
      );
      // Local-library routes are name based, while public cards use the YTM
      // channel route. Warm both keys so opening the current artist does not
      // repeat the same catalog request after playback has already started.
      const youtubeNameRoute = toYouTubeMusicArtistRouteId(undefined, name);
      const profileRequests: Promise<unknown>[] = [
        apis.getYouTubeMusicArtistProfile(youtubeRouteId),
        ...(youtubeNameRoute !== youtubeRouteId
          ? [apis.getYouTubeMusicArtistProfile(youtubeNameRoute)]
          : []),
        ...(spotifyId
          ? [Promise.all([
              apis.getArtist(spotifyId),
              apis.getArtistTopTracks(spotifyId, 'BR'),
              apis.getArtistDiscography(spotifyId),
            ])]
          : []),
      ];
      await Promise.allSettled([imageRequest, ...profileRequests]);
    })
      .catch(() => {})
      .then(() => undefined)
      .finally(() => {
        if (pendingPrefetches.get(cacheKey) === request) {
          pendingPrefetches.delete(cacheKey);
        }
        if (!activeArtistKeys.has(cacheKey)) {
          void artistApis.then((apis) => {
            if (spotifyId) {
              apis.discardPrefetchedArtistProfile(spotifyId);
              apis.discardPrefetchedArtistTopTracks(spotifyId);
            }
            apis.discardPrefetchedYouTubeMusicArtistProfile(youtubeRouteId);
          }).catch(() => {});
        }
      });
    pendingPrefetches.set(cacheKey, request);
  });
};

export const _getActivePrefetchedArtistKeysForTests = () =>
  [...activeArtistKeys];

export const _clearArtistProfilePrefetchForTests = () => {
  activeArtistKeys.clear();
  activeProfiles.clear();
  pendingPrefetches.clear();
};
