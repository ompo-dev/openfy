import AsyncStorage from '@react-native-async-storage/async-storage';

export type FollowedArtist = {
  id: string;
  name: string;
  imageURL: string;
  followedAt: number;
};
export type FollowArtistInput = Pick<FollowedArtist, 'id' | 'name' | 'imageURL'>;

export const artistFollowKey = (name: string) => name.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export const matchesFollowedArtist = (artist: FollowArtistInput, candidate: { id?: string; name: string }) =>
  Boolean(artist.id && artist.id === candidate.id) || artistFollowKey(artist.name) === artistFollowKey(candidate.name);

const STORAGE_KEY = 'openfy_followed_artists_v1';
let artists: FollowedArtist[] = [];
let hydrated = false;
let hydration: Promise<FollowedArtist[]> | null = null;
let mutations: Promise<unknown> = Promise.resolve();
const listeners = new Set<(artists: FollowedArtist[]) => void>();

export const normalizeFollowedArtists = (value: unknown): FollowedArtist[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is FollowedArtist => Boolean(item && typeof item === 'object' &&
    typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim() &&
    typeof item.imageURL === 'string' && Number.isFinite(item.followedAt)))
    .sort((a, b) => b.followedAt - a.followedAt)
    .filter((item) => {
      const key = artistFollowKey(item.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const publish = (next: FollowedArtist[]) => {
  artists = next;
  listeners.forEach((listener) => listener(next));
};
export const getFollowedArtistsSnapshot = () => artists;
export const isArtistFollowed = (candidate: { id?: string; name: string }) =>
  artists.some((artist) => matchesFollowedArtist(artist, candidate));

export const getFollowedArtists = (): Promise<FollowedArtist[]> => {
  if (hydrated) return Promise.resolve(artists);
  if (hydration) return hydration;
  hydration = (async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    let next: FollowedArtist[] = [];
    try { next = normalizeFollowedArtists(raw ? JSON.parse(raw) : []); } catch { /* Invalid legacy data. */ }
    hydrated = true;
    publish(next);
    return next;
  })().finally(() => { hydration = null; });
  return hydration;
};

export const setArtistFollowed = (artist: FollowArtistInput, following: boolean): Promise<void> => {
  if (!artistFollowKey(artist.name)) return Promise.reject(new Error('Artista sem nome'));
  const mutation = mutations.then(async () => {
    const current = await getFollowedArtists();
    const existing = current.find((item) => matchesFollowedArtist(item, artist));
    const remaining = current.filter((item) => !matchesFollowedArtist(item, artist));
    const next = following ? normalizeFollowedArtists([{
      ...artist, name: artist.name.trim(),
      imageURL: artist.imageURL || existing?.imageURL || '',
      followedAt: existing?.followedAt || Date.now(),
    }, ...remaining]) : remaining;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    publish(next);
  });
  mutations = mutation.catch(() => {});
  return mutation;
};

export const subscribeFollowedArtists = (listener: (next: FollowedArtist[]) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
