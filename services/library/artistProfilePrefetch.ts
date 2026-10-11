import { getCachedArtistImage } from './artistImageCache';
import { prefetchImage } from '../images/imagePrefetch';
import { isArtistFollowed } from './followedArtists';
import { rememberDetailPreview } from '../navigation/detailPreview';
import { artistIdentityKey, canonicalArtistReference, resolveTrackArtists, type ArtistIdentityTrack } from '../search/artistIdentity';

const loadArtistApis = () => Promise.all([
  import('../../api/search/catalog'), import('../../api/albums/youtubeMusicAlbum'),
]).then(([catalog, albums]) => ({ ...catalog, ...albums }));
let artistApisPromise: ReturnType<typeof loadArtistApis> | null = null;
const getArtistApis = () => {
  if (!artistApisPromise) artistApisPromise = loadArtistApis().catch((error) => {
    artistApisPromise = null;
    throw error;
  });
  return artistApisPromise;
};
type ArtistRef = { id?: string; name: string };
const activeArtistKeys = new Set<string>();
const pending = new Set<string>();
const warmed = new Map<string, number>();
const jobs = new Map<string, ArtistRef>();
let running = 0;
let trackPrefetchGeneration = 0;

const pump = () => {
  while (running < 2 && jobs.size) {
    const [key, artist] = [...jobs.entries()].sort(([a, left], [b, right]) =>
      Number(activeArtistKeys.has(b)) - Number(activeArtistKeys.has(a)) ||
      Number(isArtistFollowed(right)) - Number(isArtistFollowed(left)))[0];
    jobs.delete(key);
    running += 1;
    void getArtistApis().then(async (apis) => {
      const id = artist.id!;
      await Promise.allSettled([
        getCachedArtistImage(artist.name, () => apis.getArtistCatalogImage(id, artist.name), [id]),
        ...(isArtistFollowed(artist) || activeArtistKeys.values().next().value === key ? [apis.getYouTubeMusicArtistProfile(id).then(async (profile) => {
          if (profile.artist.imageURL) void prefetchImage(profile.artist.imageURL);
          rememberDetailPreview('artist', profile.artist.id, {
            title: profile.artist.name, imageURL: profile.artist.imageURL,
          });
          if (!isArtistFollowed(artist)) return;
          for (const album of [...profile.albums, ...profile.singlesAndEps].slice(0, 2)) {
            rememberDetailPreview('album', album.id, { title: album.title, imageURL: album.imageURL });
            await prefetchImage(album.imageURL).catch(() => {});
            await apis.getYouTubeMusicAlbum(album.id).catch(() => {});
          }
        })] : []),
      ]);
      warmed.set(key, Date.now() + 5 * 60_000);
      while (warmed.size > 100) warmed.delete(warmed.keys().next().value!);
    }).catch(() => {}).finally(() => {
      pending.delete(key);
      running -= 1;
      pump();
    });
  }
};

/** Warm actual linked channels; a missing channel is never replaced by a name search. */
export const prefetchArtistData = (artists: ArtistRef[]): void => {
  artists.map(canonicalArtistReference).slice(0, 16).forEach((artist) => {
    const key = artistIdentityKey(artist.id);
    if (!key.startsWith('youtube:') || pending.has(key) || (warmed.get(key) || 0) > Date.now()) return;
    if (jobs.size >= 24) {
      const replaceable = [...jobs.entries()].find(([id, ref]) =>
        !activeArtistKeys.has(id) && !isArtistFollowed(ref));
      if (!replaceable) return;
      jobs.delete(replaceable[0]);
      pending.delete(replaceable[0]);
    }
    jobs.set(key, artist);
    pending.add(key);
  });
  pump();
};

/** Audio starts independently; old recording requests cannot replace the active artists. */
export const prefetchTrackArtistData = (track: ArtistIdentityTrack): void => {
  const generation = ++trackPrefetchGeneration;
  void resolveTrackArtists(track).then((artists) => {
    if (generation !== trackPrefetchGeneration) return;
    activeArtistKeys.clear();
    artists.slice(0, 5).forEach((artist) => activeArtistKeys.add(artistIdentityKey(artist.id)));
    prefetchArtistData(artists);
  }).catch(() => {});
};

export const _getActivePrefetchedArtistKeysForTests = () => [...activeArtistKeys];
export const _clearArtistProfilePrefetchForTests = () => {
  trackPrefetchGeneration += 1;
  activeArtistKeys.clear();
  jobs.clear();
  pending.clear();
  warmed.clear();
};
