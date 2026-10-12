import AsyncStorage from '@react-native-async-storage/async-storage';
import { getYouTubeMusicArtistProfile } from '../../api/search/catalog';
import { artistIdentityKey, resolveTrackArtist } from '../search/artistIdentity';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { loadHomeRadio } from './homeRadio';
import {
  type HomeCatalog,
  type HomeRelease,
  type PersonalizedHomeTrack,
  type RecommendationSeed,
} from './personalizedHome';

const TTL = 6 * 60 * 60_000;
const STORAGE_KEY = 'openfy_home_catalog_v3';
const cache = createAsyncResourceCache<HomeCatalog>({
  name: 'home release catalog', category: 'home', maxEntries: 4,
  shouldCache: (catalog) => Boolean(catalog.releases.length || catalog.similarTracks.length || catalog.radios?.length),
});
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();

export const sortHomeReleases = (releases: HomeRelease[]): HomeRelease[] => {
  const seen = new Set<string>();
  return releases.filter((release) => {
    const key = `${normalize(release.artistName)}:${normalize(release.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((first, second) => second.releaseDate.localeCompare(first.releaseDate)).slice(0, 36);
};

/** Reuse artist API caches; never scan the entire library's discography on Home. */
export const loadHomeCatalog = (
  seeds: RecommendationSeed[],
  anchors: PersonalizedHomeTrack[],
  force = false,
  onUpdate?: (catalog: HomeCatalog) => void
): Promise<HomeCatalog> => {
  const selected = seeds.filter((seed) => seed.matchArtist !== false).slice(0, 5);
  if (!selected.length) return Promise.resolve({ releases: [], similarTracks: [] });
  const key = JSON.stringify(selected.map((seed) => [seed.id, normalize(seed.name)]));
  return cache.getOrLoad(force ? `${key}:refresh` : key, async () => {
    let previous: HomeCatalog | undefined;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored?.key === key && Array.isArray(stored.catalog?.releases) && Array.isArray(stored.catalog?.similarTracks)) {
        previous = stored.catalog;
        if (!force && Date.now() - stored.fetchedAt < TTL) return previous!;
      }
    } catch {}
    const groups = new Map<string, HomeRelease[]>();
    const radios = new Map<string, NonNullable<HomeCatalog['radios']>[number]>();
    const snapshot = (): HomeCatalog => ({
      releases: sortHomeReleases(selected.flatMap((seed) => groups.get(seed.name)?.length
        ? groups.get(seed.name)! : previous?.releases.filter((release) => normalize(release.artistName) === normalize(seed.name)) || [])),
      radios: selected.flatMap((seed) => {
        const radio = radios.get(seed.name) || previous?.radios?.find((item) => item.seed.name === seed.name);
        return radio ? [radio] : [];
      }),
      similarTracks: radios.get(selected[0].name)?.tracks || previous?.similarTracks || [],
    });
    const loadReleases = async (seed: RecommendationSeed): Promise<HomeRelease[]> => {
      const recording = anchors.find((track) => track.artists?.some((credit) => credit.id === seed.id ||
        normalize(credit.name) === normalize(seed.name)));
      const route = artistIdentityKey(seed.id).startsWith('youtube:')
        ? seed.id! : (await resolveTrackArtist({ id: seed.id, name: seed.name }, recording)).id;
      if (!route) return [];
      let profile: Awaited<ReturnType<typeof getYouTubeMusicArtistProfile>> | undefined;
      try { profile = await getYouTubeMusicArtistProfile(route); } catch {}
      const items = profile ? [...profile.albums, ...profile.singlesAndEps] : [];
      return items.slice(0, 24).map((item) => ({
        id: item.id, title: item.title, imageURL: item.imageURL,
        artistName: seed.name, artistId: profile?.artist.id || route,
        artistImageURL: profile?.artist.imageURL || '',
        releaseDate: item.releaseDate || item.subtitle.match(/\b(?:19|20)\d{2}\b/)?.[0] || '',
        releaseType: item.releaseType || 'release',
      }));
    };
    let cursor = 0;
    // Two workers publish each artist as it arrives; a slow fifth profile cannot hold up the first rail.
    await Promise.all([0, 1].map(async () => {
      while (cursor < selected.length) {
        const seed = selected[cursor++];
        const releases = await loadReleases(seed).catch(() => []);
        groups.set(seed.name, releases);
        onUpdate?.(snapshot());
        const tracks = await loadHomeRadio(seed, anchors).catch(() => []);
        if (tracks.length) radios.set(seed.name, { seed, tracks });
        onUpdate?.(snapshot());
      }
    }));
    const next = snapshot();
    const { releases, similarTracks } = next;
    const catalog: HomeCatalog = {
      releases: releases.length ? releases : previous?.releases || [],
      similarTracks: similarTracks.length ? similarTracks : previous?.similarTracks || [],
      radios: next.radios?.length ? next.radios : previous?.radios || [],
    };
    // An offline/failed refresh must not erase useful cached results.
    if (releases.length || similarTracks.length || catalog.radios?.length) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ key, fetchedAt: Date.now(), catalog })).catch(() => {});
      if (force) cache.set(key, catalog, TTL);
    }
    return catalog;
  }, force ? 0 : TTL);
};
