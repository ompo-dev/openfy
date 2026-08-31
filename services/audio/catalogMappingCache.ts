import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent cache for Spotify → YouTube videoId mappings.
 *
 * Once a canonical match is confirmed (confidence >= 90), we persist the
 * association. Future resolves go directly to YouTubeStreamResolver without
 * re-running the search + canonical matching pipeline.
 *
 * A 403 from GVS does NOT invalidate the mapping — the videoId is correct;
 * only the stream authorization has failed. Use `invalidateCatalogMapping`
 * only when the mapping itself is wrong (e.g., user override, content removal).
 */

export type CatalogMapping = {
  videoId: string;
  confirmedAt: number;
  confidence: number;
  source: 'youtube_search' | 'ytmusic' | 'user_direct';
};

const STORAGE_KEY = '@openfy/catalog-mapping-v1';
const MAPPING_MAX_AGE_MS = 30 * 24 * 60 * 60_000;  // 30 days
const MIN_CONFIDENCE_TO_CACHE = 90;

// In-memory layer on top of AsyncStorage for hot path (current session).
const memoryCache = new Map<string, CatalogMapping>();
let hydrated = false;

const hydrateIfNeeded = async (): Promise<void> => {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    const now = Date.now();
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        entry &&
        typeof entry === 'object' &&
        'videoId' in entry &&
        'confirmedAt' in entry &&
        typeof (entry as CatalogMapping).videoId === 'string' &&
        typeof (entry as CatalogMapping).confirmedAt === 'number' &&
        now - (entry as CatalogMapping).confirmedAt < MAPPING_MAX_AGE_MS
      ) {
        memoryCache.set(id, entry as CatalogMapping);
      }
    }
  } catch { /* Non-fatal: we just start with an empty cache. */ }
};

const persist = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memoryCache)));
  } catch { /* Non-fatal. */ }
};

/** Returns the cached mapping for a spotifyId, or null if absent/expired. */
export const getCatalogMapping = async (spotifyId: string): Promise<CatalogMapping | null> => {
  await hydrateIfNeeded();
  const entry = memoryCache.get(spotifyId);
  if (!entry) return null;
  if (Date.now() - entry.confirmedAt > MAPPING_MAX_AGE_MS) {
    memoryCache.delete(spotifyId);
    return null;
  }
  return entry;
};

/** Persists a confirmed mapping. Only stores entries with confidence >= threshold. */
export const setCatalogMapping = async (
  spotifyId: string,
  mapping: CatalogMapping
): Promise<void> => {
  if (mapping.confidence < MIN_CONFIDENCE_TO_CACHE) return;
  await hydrateIfNeeded();
  memoryCache.set(spotifyId, mapping);
  await persist();
};

/**
 * Removes a cached mapping (use only when the mapping is wrong, not on 403).
 * A GVS 403 means stream authorization failed — the videoId is still correct.
 */
export const invalidateCatalogMapping = async (spotifyId: string): Promise<void> => {
  await hydrateIfNeeded();
  memoryCache.delete(spotifyId);
  await persist();
};

/** @internal — test helper */
export const _resetCatalogMappingCacheForTests = (): void => {
  memoryCache.clear();
  hydrated = false;
};
