import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ArtistModel, TrackModel } from '@models';

export type SearchSelection =
  | { kind: 'artist'; artist: ArtistModel }
  | { kind: 'track'; track: TrackModel };
export type SearchHistoryEntry = SearchSelection & { selectedAt: number };

const STORAGE_KEY = 'openfy_search_history_v1';
const MAX_ENTRIES = 40;
let entries: SearchHistoryEntry[] = [];
let hydrated = false;
let hydration: Promise<SearchHistoryEntry[]> | null = null;
let mutationQueue: Promise<unknown> = Promise.resolve();
const listeners = new Set<(history: SearchHistoryEntry[]) => void>();

export const searchHistoryKey = (entry: SearchSelection) =>
  `${entry.kind}:${entry.kind === 'artist' ? entry.artist.id : entry.track.id}`;

export const normalizeSearchHistory = (value: unknown): SearchHistoryEntry[] => {
  if (!Array.isArray(value)) return [];
  const valid = value.filter((entry): entry is SearchHistoryEntry => {
    if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.selectedAt)) return false;
    const item = entry.kind === 'artist' ? entry.artist : entry.kind === 'track' ? entry.track : null;
    if (!item || typeof item.id !== 'string' || !item.id.trim()) return false;
    return entry.kind === 'artist'
      ? typeof item.name === 'string' && Boolean(item.name.trim()) && typeof item.imageURL === 'string'
      : typeof item.title === 'string' && Boolean(item.title.trim()) && typeof item.subtitle === 'string';
  }).sort((a, b) => b.selectedAt - a.selectedAt);
  const seen = new Set<string>();
  return valid.filter((entry) => {
    const key = searchHistoryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_ENTRIES);
};

const publish = (history: SearchHistoryEntry[]) => {
  entries = history;
  listeners.forEach((listener) => listener(history));
};

export const getSearchHistory = (): Promise<SearchHistoryEntry[]> => {
  if (hydrated) return Promise.resolve(entries);
  if (hydration) return hydration;
  hydration = (async () => {
    let history: SearchHistoryEntry[] = [];
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      history = normalizeSearchHistory(raw ? JSON.parse(raw) : null);
    } catch { /* An unavailable or invalid history must not block search. */ }
    hydrated = true;
    publish(history);
    return history;
  })().finally(() => { hydration = null; });
  return hydration;
};

const mutateHistory = (update: (history: SearchHistoryEntry[]) => SearchHistoryEntry[]) => {
  const mutation = mutationQueue.then(async () => {
    const history = await getSearchHistory();
    const next = normalizeSearchHistory(update(history));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    publish(next);
  });
  mutationQueue = mutation.catch(() => {});
  return mutation;
};

export const rememberSearchSelection = (selection: SearchSelection) => {
  const selectedAt = Date.now();
  return mutateHistory((history) => [{ ...selection, selectedAt },
    ...history.filter((entry) => searchHistoryKey(entry) !== searchHistoryKey(selection))]);
};
export const removeSearchHistoryEntry = (key: string) =>
  mutateHistory((history) => history.filter((entry) => searchHistoryKey(entry) !== key));
export const clearSearchHistory = () => mutateHistory(() => []);
export const subscribeSearchHistory = (listener: (history: SearchHistoryEntry[]) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
