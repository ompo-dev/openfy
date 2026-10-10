import AsyncStorage from '@react-native-async-storage/async-storage';
import { getYouTubeMusicArtistProfile } from '../../api/search/catalog';
import { getArtistDiscography } from '../../api/artists/artistDiscography';
import { toYouTubeMusicArtistRouteId } from '../youtubeMusicClient';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { loadHomeRadio } from './homeRadio';
import {
  type HomeCatalog,
  type HomeRelease,
  type PersonalizedHomeTrack,
  type RecommendationSeed,
} from './personalizedHome';

const TTL = 6 * 60 * 60_000;
const STORAGE_KEY = 'openfy_home_catalog_v1';
const cache = createAsyncResourceCache<HomeCatalog>({
  name: 'home release catalog', category: 'home', maxEntries: 4,
  shouldCache: (catalog) => Boolean(catalog.releases.length || catalog.similarTracks.length),
});
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();

export const sortHomeReleases = (releases: HomeRelease[]): HomeRelease[] => {
  const seen = new Set<string>();
  return releases.filter((release) => {
    const key = `${normalize(release.artistName)}:${normalize(release.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((first, second) => second.releaseDate.localeCompare(first.releaseDate)).slice(0, 12);
};

/** Reuse artist API caches; never scan the entire library's discography on Home. */
export const loadHomeCatalog = (
  seeds: RecommendationSeed[],
  anchors: PersonalizedHomeTrack[],
  force = false
): Promise<HomeCatalog> => {
  const selected = seeds.filter((seed) => seed.matchArtist !== false).slice(0, seeds.some((seed) => seed.followed) ? 5 : 2);
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
    const groups: HomeRelease[][] = [];
    const loadReleases = async (seed: RecommendationSeed): Promise<HomeRelease[]> => {
      const route = seed.id?.startsWith('ytartist_')
        ? seed.id : toYouTubeMusicArtistRouteId(undefined, seed.name);
      let profile: Awaited<ReturnType<typeof getYouTubeMusicArtistProfile>> | undefined;
      try { profile = await getYouTubeMusicArtistProfile(route); } catch {}
      let items = profile ? [...profile.albums, ...profile.singlesAndEps] : [];
      if (!items.length && seed.id && /^[A-Za-z0-9]{22}$/.test(seed.id)) {
        try {
          const discography = await getArtistDiscography(seed.id);
          items = [...discography.albums, ...discography.singlesAndEps];
        } catch {}
      }
      return items.slice(0, 24).map((item) => ({
        id: item.id, title: item.title, imageURL: item.imageURL,
        artistName: seed.name, artistId: profile?.artist.id || route,
        artistImageURL: profile?.artist.imageURL || '',
        releaseDate: item.releaseDate || item.subtitle.match(/\b(?:19|20)\d{2}\b/)?.[0] || '',
        releaseType: item.releaseType || 'release',
      }));
    };
    // Explicit follows expand coverage, but do not flood playback with catalog requests.
    for (let index = 0; index < selected.length; index += 2) {
      groups.push(...await Promise.all(selected.slice(index, index + 2).map(loadReleases)));
    }
    const similarTracks = await loadHomeRadio(selected[0], anchors);
    const releases = sortHomeReleases(groups.flat());
    const catalog: HomeCatalog = {
      releases: releases.length ? releases : previous?.releases || [],
      similarTracks: similarTracks.length ? similarTracks : previous?.similarTracks || [],
    };
    // An offline/failed refresh must not erase useful cached results.
    if (releases.length || similarTracks.length) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ key, fetchedAt: Date.now(), catalog })).catch(() => {});
      if (force) cache.set(key, catalog, TTL);
    }
    return catalog;
  }, force ? 0 : TTL);
};
