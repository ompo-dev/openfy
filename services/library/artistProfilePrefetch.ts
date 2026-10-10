import { getCachedArtistImage } from './artistImageCache';
import { toYouTubeMusicArtistRouteId } from '../youtubeMusicClient';
import { prefetchImage } from '../images/imagePrefetch';
import { isArtistFollowed } from './followedArtists';
import { rememberDetailPreview } from '../navigation/detailPreview';

const withPrefetchedPortrait = <T extends { imageURL?: string; artist?: { imageURL?: string } }>(request: Promise<T>): Promise<T> =>
  request.then((profile) => {
    const imageURL = profile.artist?.imageURL || profile.imageURL;
    if (imageURL) void prefetchImage(imageURL);
    return profile;
  });

const loadArtistApis = () => Promise.all([
  import('../../api/artists/artist'),
  import('../../api/artists/artistDiscography'),
  import('../../api/artists/artistTopTracks'),
  import('../../api/search/catalog'),
  import('../../api/albums/youtubeMusicAlbum'),
]).then(([artist, discography, topTracks, catalog, albums]) => ({
  ...artist,
  ...discography,
  ...topTracks,
  ...catalog,
  ...albums,
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
const activeProfiles = new Map<string, { spotifyId: string; youtubeRouteId: string; name: string }>();
const pendingPrefetches = new Map<string, Promise<void>>();
const backgroundPendingPrefetches = new Map<string, Promise<void>>();
const backgroundQueue = new Map<string, { artist: ArtistRef; run: () => Promise<void>; cancel: () => void }>();
const MAX_BACKGROUND_QUEUE = 24;
let backgroundActive = 0;
const pumpBackgroundQueue = () => {
  while (backgroundActive < 2 && backgroundQueue.size) {
    const [key, job] = [...backgroundQueue.entries()].sort(([, a], [, b]) =>
      Number(isArtistFollowed(b.artist)) - Number(isArtistFollowed(a.artist)))[0];
    backgroundQueue.delete(key);
    backgroundActive += 1;
    void job.run().finally(() => { backgroundActive -= 1; pumpBackgroundQueue(); });
  }
};

const normalize = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

const getTrackArtists = ({ artistName, artists }: TrackArtistData, limit = MAX_ACTIVE_ARTISTS): ArtistRef[] => {
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
  }).slice(0, limit);
};

/** Warm only the current track's credited artists; request/result caches are bounded by their API owners. */
export const prefetchTrackArtistData = (track: TrackArtistData): void => {
  const artists = getTrackArtists(track);
  if (!artists.length) return;
  const artistApis = getArtistApis();
  // Extra credits need their photos, not another full catalog for each producer.
  getTrackArtists(track, 16).slice(MAX_ACTIVE_ARTISTS).forEach((artist) => {
    void artistApis.then((apis) => getCachedArtistImage(
      artist.name, () => apis.getArtistCatalogImage(artist.id || '', artist.name),
      [artist.id || ''].filter(Boolean)
    )).catch(() => {});
  });
  const nextProfiles = new Map(artists.map((artist) => {
    const id = artist.id?.trim() || '';
    const spotifyId = /^[A-Za-z0-9]{22}$/.test(id) ? id : '';
    const youtubeRouteId = id.startsWith('ytartist_')
      ? id
      : toYouTubeMusicArtistRouteId(id.startsWith('UC') ? id : undefined, artist.name);
    return [spotifyId || youtubeRouteId, { spotifyId, youtubeRouteId, name: artist.name }] as const;
  }));
  const nextKeys = new Set(nextProfiles.keys());

  activeProfiles.forEach((profile, key) => {
    if (nextKeys.has(key)) return;
    if (isArtistFollowed({ id: profile.spotifyId || profile.youtubeRouteId, name: profile.name })) {
      activeProfiles.delete(key);
      activeArtistKeys.delete(key);
      return;
    }
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
        withPrefetchedPortrait(apis.getYouTubeMusicArtistProfile(youtubeRouteId)),
        ...(youtubeNameRoute !== youtubeRouteId
          ? [withPrefetchedPortrait(apis.getYouTubeMusicArtistProfile(youtubeNameRoute))]
          : []),
        ...(spotifyId
          ? [Promise.all([
              withPrefetchedPortrait(apis.getArtist(spotifyId)),
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
        if (!activeArtistKeys.has(cacheKey) && !isArtistFollowed(artist)) {
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

/** Warm likely-to-open profiles without evicting the artists of the current track. */
export const prefetchArtistData = (artists: ArtistRef[]): void => {
  const seen = new Set<string>();
  const candidates = artists
    .map((artist) => ({ id: artist.id?.trim() || '', name: artist.name.trim() }))
    .filter((artist) => {
      const key = artist.id || normalize(artist.name);
      if (!artist.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 16);
  if (!candidates.length) return;

  const artistApis = getArtistApis();
  candidates.forEach((artist) => {
    const spotifyId = /^[A-Za-z0-9]{22}$/.test(artist.id) ? artist.id : '';
    const youtubeRouteId = artist.id.startsWith('ytartist_')
      ? artist.id
      : toYouTubeMusicArtistRouteId(
          artist.id.startsWith('UC') ? artist.id : undefined,
          artist.name
        );
    const cacheKey = spotifyId || youtubeRouteId;
    if (backgroundPendingPrefetches.has(cacheKey)) return;
    if (backgroundQueue.size >= MAX_BACKGROUND_QUEUE) {
      const replaceable = [...backgroundQueue.entries()].find(([, job]) => !isArtistFollowed(job.artist));
      if (!replaceable) return;
      const [key, job] = replaceable;
      backgroundQueue.delete(key);
      backgroundPendingPrefetches.delete(key);
      job.cancel();
    }

    let finish!: () => void;
    const request = new Promise<void>((resolve) => { finish = resolve; });
    const run = () => artistApis
      .then(async (apis) => {
        const youtubeNameRoute = toYouTubeMusicArtistRouteId(undefined, artist.name);
        await Promise.allSettled([
          getCachedArtistImage(
            artist.name,
            () => apis.getArtistCatalogImage(spotifyId || youtubeRouteId, artist.name),
            [artist.id, spotifyId, youtubeRouteId].filter(Boolean)
          ),
          withPrefetchedPortrait(apis.getYouTubeMusicArtistProfile(youtubeRouteId)).then(async (profile) => {
            if (!isArtistFollowed(artist)) return;
            rememberDetailPreview('artist', youtubeRouteId, { title: profile.artist.name, imageURL: profile.artist.imageURL });
            for (const album of [...profile.albums, ...profile.singlesAndEps].slice(0, 2)) {
              if (!isArtistFollowed(artist)) break;
              rememberDetailPreview('album', album.id, { title: album.title, imageURL: album.imageURL });
              await prefetchImage(album.imageURL).catch(() => {});
              if (album.id.startsWith('ytalbum_')) await apis.getYouTubeMusicAlbum(album.id).catch(() => {});
            }
          }),
          ...(youtubeNameRoute !== youtubeRouteId
            ? [withPrefetchedPortrait(apis.getYouTubeMusicArtistProfile(youtubeNameRoute))]
            : []),
          ...(spotifyId
            ? [Promise.all([
                withPrefetchedPortrait(apis.getArtist(spotifyId)),
                apis.getArtistTopTracks(spotifyId, 'BR'),
                apis.getArtistDiscography(spotifyId),
              ])]
            : []),
        ]);
      })
      .catch(() => {})
      .then(() => undefined)
      .finally(() => {
        if (backgroundPendingPrefetches.get(cacheKey) === request) {
          backgroundPendingPrefetches.delete(cacheKey);
        }
        finish();
      });
    backgroundPendingPrefetches.set(cacheKey, request);
    backgroundQueue.set(cacheKey, { artist, run, cancel: finish });
  });
  pumpBackgroundQueue();
};

export const _clearArtistProfilePrefetchForTests = () => {
  activeArtistKeys.clear();
  activeProfiles.clear();
  pendingPrefetches.clear();
  backgroundPendingPrefetches.clear();
  backgroundQueue.forEach((job) => job.cancel());
  backgroundQueue.clear();
};
