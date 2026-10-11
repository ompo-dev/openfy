import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeTrackIsrc } from '../../models/Track/TrackModel';
import { getCachedAppSettings } from '../settings/appSettings';
import { getYouTubeMusicClient, getYouTubeMusicText } from '../youtubeMusicClient';
import { fetchLyricsFromLetras, fetchLyricsFromLrclib, getOfflineLyrics, isCanonicalLyricsCandidate,
  type LyricsData, type LyricsFetchOptions } from './lyricsService';
import { parseLyricsPayload } from './lyricsFormats';
import { isLyricsProvider, type LyricsProviderId, type LyricsProviderSelection, type LyricsProviderStatus } from './lyricsSources';

type Query = LyricsFetchOptions & { trackName: string; artistName: string; durationMs: number; albumName?: string; releaseDate?: string };
const PREFIX = 'openfy_provider_lyrics_v1:';
const choices = new Map<string, LyricsProviderSelection>();
const cache = new Map<string, LyricsData>();
const cacheGenerations = new Map<string, number>();
let requestGeneration = 0;
const MAX_CACHE = 100;
let choiceWrites: Promise<unknown> = Promise.resolve();
let cacheWrites: Promise<unknown> = Promise.resolve();
const headers = { 'User-Agent': 'Openfy/1.0 (https://github.com/ompo-dev/openfy)' };
export const getCachedTrackLyricsProvider = (trackId: string) => choices.get(trackId) || 'auto';

export const getTrackLyricsProvider = async (trackId: string): Promise<LyricsProviderSelection> => {
  if (choices.has(trackId)) return choices.get(trackId)!;
  const raw = await AsyncStorage.getItem(`${PREFIX}choice:${trackId}`).catch(() => null);
  const choice = isLyricsProvider(raw) ? raw : 'auto';
  choices.set(trackId, choice);
  return choice;
};

export const setTrackLyricsProvider = async (trackId: string, provider: LyricsProviderSelection) => {
  const write = choiceWrites.then(async () => {
    await AsyncStorage.setItem(`${PREFIX}choice:${trackId}`, provider);
    choices.set(trackId, provider);
  });
  choiceWrites = write.catch(() => {});
  return write;
};

const persistResult = (key: string, lyrics: LyricsData) => {
  const write = cacheWrites.then(async () => {
    const indexKey = `${PREFIX}index`;
    const raw = await AsyncStorage.getItem(indexKey);
    let saved: unknown = [];
    try { saved = raw ? JSON.parse(raw) : []; } catch { /* Rebuild a damaged index. */ }
    const keys = Array.isArray(saved) ? saved.filter((entry): entry is string =>
      typeof entry === 'string' && entry.startsWith(`${PREFIX}result:`) && entry !== key) : [];
    keys.push(key);
    const evicted = keys.splice(0, Math.max(0, keys.length - MAX_CACHE));
    await AsyncStorage.multiSet([[key, JSON.stringify({ savedAt: Date.now(), lyrics })], [indexKey, JSON.stringify(keys)]]);
    if (evicted.length) await AsyncStorage.multiRemove(evicted);
  }).catch(() => {});
  cacheWrites = write;
  return write;
};

export const lyricsPolicyKey = () => {
  const settings = getCachedAppSettings();
  return JSON.stringify([settings.lyricsEnabled, settings.lyricsSourceOrder,
    settings.lyricsDisabledSources, settings.lyricsPreferSynced]);
};

const url = (base: string, params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') search.set(key, String(value)); });
  return `${base}?${search}`;
};
const request = async (endpoint: string, signal: AbortSignal): Promise<string | null> => {
  const response = await fetch(endpoint, { signal, headers });
  if (response.status === 404 || response.status === 204) return null;
  if (!response.ok) throw new Error(`lyrics_http_${response.status}`);
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error('lyrics_response_too_large');
  return body;
};
const json = async (endpoint: string, signal: AbortSignal): Promise<any> => {
  const body = await request(endpoint, signal);
  return body ? JSON.parse(body) : null;
};
const candidateMatches = (hit: Record<string, any>, query: Query) =>
  isCanonicalLyricsCandidate({ trackName: hit.title || hit.track_name || hit.song,
    artistName: hit.artist || hit.artist_name, duration: Number(hit.duration) || undefined },
  query.trackName, query.artistName, query.durationMs);

const fetchSource = async (source: LyricsProviderId, query: Query, signal: AbortSignal): Promise<LyricsData | null> => {
  const seconds = query.durationMs ? query.durationMs / 1000 : undefined;
  if (source === 'lrclib') return fetchLyricsFromLrclib(query.trackName, query.artistName, seconds, query.albumName, query.releaseDate, signal);
  if (source === 'letras') return fetchLyricsFromLetras(query.trackName, query.artistName, seconds, signal);
  let payload: unknown;
  if (source === 'youtube') {
    if (!query.videoId) return null;
    const client = await getYouTubeMusicClient();
    if (signal.aborted) throw new Error('lyrics_cancelled');
    const shelf = await client.music.getLyrics?.(query.videoId);
    payload = getYouTubeMusicText(shelf?.description);
  } else if (source === 'better' || source === 'portato') {
    payload = await request(url(`https://lyrics-api.boidu.dev/${source === 'portato' ? 'qq/' : ''}getLyrics`,
      { s: query.trackName, a: query.artistName, d: seconds, al: query.albumName }), signal);
  } else if (source === 'lyrics-plus') {
    payload = await json(url('https://lyricsplus.prjktla.my.id/v2/lyrics/get',
      { title: query.trackName, artist: query.artistName, duration: seconds, album: query.albumName, isrc: query.isrc }), signal);
  } else if (source === 'unison') {
    const result = await json(url('https://unison.boidu.dev/lyrics',
      { song: query.trackName, artist: query.artistName, duration: seconds, album: query.albumName }), signal);
    if (!result?.success || !candidateMatches(result.data || {}, query)) return null;
    payload = result.data;
  } else if (source === 'lrc-red') {
    let isrc = query.isrc;
    if (!isrc) {
      const result = await json(url('https://lrc.red/search.json', { q: `${query.trackName} ${query.artistName}` }), signal);
      const hits = (Array.isArray(result?.hits) ? result.hits : []).filter((hit: any) => candidateMatches(hit, query));
      hits.sort((a: any, b: any) => Math.abs(Number(a.duration) * 1000 - query.durationMs) - Math.abs(Number(b.duration) * 1000 - query.durationMs));
      isrc = hits[0]?.isrc;
    }
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(isrc || '')) return null;
    payload = await request(`https://lrc.red/s/${isrc!.toUpperCase()}.ttml`, signal);
  } else if (source === 'bini') {
    const isrc = normalizeTrackIsrc(query.isrc);
    const result = await json(url('https://lyrics-api.binimum.org/', isrc ? { isrc } :
      { track: query.trackName, artist: query.artistName, duration: seconds, album: query.albumName }), signal);
    const hit = (Array.isArray(result?.results) ? result.results : []).find((item: any) =>
      isrc ? normalizeTrackIsrc(item.isrc) === isrc : candidateMatches(item, query));
    if (!hit?.lyricsUrl) return null;
    const document = new URL(hit.lyricsUrl);
    if (document.protocol !== 'https:' || !['lrc.red', 'lyrics-api.binimum.org'].includes(document.hostname)) return null;
    payload = await request(document.toString(), signal);
  }
  const parsed = parseLyricsPayload(payload, query.durationMs);
  return parsed ? { ...parsed, trackName: query.trackName, artistName: query.artistName,
    isSynced: parsed.segments.length > 0, source } : null;
};

/** Providers race independently, but selection honors persisted priority and explicit choice. */
export const fetchProviderLyrics = async (query: Query): Promise<LyricsData | null> => {
  const settings = getCachedAppSettings();
  if (!settings.lyricsEnabled || query.signal?.aborted) return null;
  const trackId = query.trackId || JSON.stringify([query.trackName, query.artistName, query.durationMs]);
  const selection = query.provider ?? await getTrackLyricsProvider(trackId);
  const sequence = (selection === 'auto' ? settings.lyricsSourceOrder : [selection])
    .filter((source) => !settings.lyricsDisabledSources.includes(source));
  const identity = JSON.stringify([trackId, query.videoId, query.trackName, query.artistName, query.durationMs,
    query.albumName, query.isrc, selection, lyricsPolicyKey()]);
  const key = `${PREFIX}result:${identity}`;
  let cached = cache.get(key);
  if (!cached) {
    try {
      const stored = await AsyncStorage.getItem(key);
      const saved = stored ? JSON.parse(stored) : null;
      if (saved?.savedAt > Date.now() - 7 * 24 * 60 * 60_000 && saved?.lyrics?.source &&
        Array.isArray(saved.lyrics.segments)) cached = saved.lyrics;
    } catch { /* A damaged cache must not prevent a provider lookup. */ }
  }
  if (cached && (!query.force || query.offline) && sequence.includes(cached.source as LyricsProviderId)) {
    query.onAttempt?.(cached.source as LyricsProviderId, 'found');
    return cached;
  }
  if (query.signal?.aborted) return null;
  if (query.offline) {
    const saved = await getOfflineLyrics(trackId);
    return saved && sequence.includes(saved.source as LyricsProviderId) ? saved : null;
  }
  const generation = ++requestGeneration;
  cacheGenerations.delete(key); cacheGenerations.set(key, generation);
  while (cacheGenerations.size > MAX_CACHE * 2) cacheGenerations.delete(cacheGenerations.keys().next().value!);
  const controllers = sequence.map(() => new AbortController());
  const timers: ReturnType<typeof setTimeout>[] = [];
  const attempts = new Map<LyricsProviderId, LyricsProviderStatus>();
  const publish = (source: LyricsProviderId, status: LyricsProviderStatus) => {
    attempts.set(source, status);
    query.onAttempt?.(source, status);
  };
  let finished = false;
  const cancel = () => controllers.forEach((controller) => controller.abort());
  query.signal?.addEventListener('abort', cancel, { once: true });
  const jobs = sequence.map((source, index) => {
    const controller = controllers[index];
    publish(source, 'loading');
    const timeout = new Promise<null>((resolve) => {
      timers.push(setTimeout(() => { controller.abort(); resolve(null); }, 8000));
    });
    const aborted = new Promise<null>((resolve) => {
      if (controller.signal.aborted) resolve(null);
      else controller.signal.addEventListener('abort', () => resolve(null), { once: true });
    });
    return Promise.race([fetchSource(source, query, controller.signal), timeout, aborted]).then((result) => {
      if (!finished && !query.signal?.aborted) publish(source, result ? 'found' : 'missing');
      return result;
    }).catch(() => {
      if (!finished && !query.signal?.aborted) publish(source, 'error');
      return null;
    });
  });
  try {
    let fallback: LyricsData | null = null;
    for (const job of jobs) {
      const result = await job;
      if (query.signal?.aborted) return null;
      if (!result) continue;
      fallback ||= result;
      if (selection !== 'auto' || !settings.lyricsPreferSynced || result.segments.some((line) => line.words?.length)) {
        fallback = result;
        break;
      }
      if (!fallback.isSynced && result.isSynced) fallback = result;
    }
    if (fallback && !query.signal?.aborted && cacheGenerations.get(key) === generation) {
      cache.delete(key); cache.set(key, fallback);
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
      void persistResult(key, fallback);
    }
    return query.signal?.aborted ? null : fallback;
  } finally {
    finished = true;
    if (!query.signal?.aborted) attempts.forEach((status, source) => {
      if (status === 'loading') publish(source, 'cancelled');
    });
    timers.forEach(clearTimeout); cancel();
    query.signal?.removeEventListener('abort', cancel);
  }
};
