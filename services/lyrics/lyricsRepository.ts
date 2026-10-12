import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { log } from '../../utils/appLogger';
import { normalizeTrackIsrc } from '../../models/Track/TrackModel';
import { getCachedAppSettings } from '../settings/appSettings';
import { getYouTubeMusicClient, getYouTubeMusicText } from '../youtubeMusicClient';
import { fetchLyricsFromLetras, fetchLyricsFromLrclib, getOfflineLyrics, isCanonicalLyricsCandidate,
  type LyricsData, type LyricsFetchOptions } from './lyricsService';
import { parseLyricsPayload } from './lyricsFormats';
import { LyricsHttpError, requestLyricsJson, requestLyricsText } from './lyricsHttp';
import { lyricsSearchIdentity } from './lyricsQuery';
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
const FORMAT_VERSION = 'v2-word-clock';
const LYRICS_PLUS_HOSTS = ['https://lyricsplus.prjktla.my.id', 'https://lyricsplus.atomix.one',
  'https://lyricsplus.binimum.org', 'https://lyricsplus.prjktla.workers.dev',
  'https://lyricsplus-seven.vercel.app', 'https://lyrics-plus-backend.vercel.app'];
let lastLyricsPlusHost: string | undefined;
const summary = (lyrics: Pick<LyricsData, 'segments' | 'isSynced' | 'source'> | null) => ({
  provider: lyrics?.source, lines: lyrics?.segments.length || 0,
  words: lyrics?.segments.reduce((count, line) => count + (line.words?.length || 0), 0) || 0,
  syllables: lyrics?.segments.reduce((count, line) => count + (line.words || [])
    .reduce((size, word) => size + (word.syllables?.length || 1), 0), 0) || 0,
  synced: lyrics?.isSynced || false,
});
export const getCachedTrackLyricsProvider = (trackId: string) => choices.get(trackId) || 'auto';

export const getTrackLyricsProvider = async (trackId: string): Promise<LyricsProviderSelection> => {
  if (choices.has(trackId)) return choices.get(trackId)!;
  const raw = await AsyncStorage.getItem(`${PREFIX}choice:${trackId}`).catch((error) => {
    log.error('lyrics provider choice read failed', { trackId, error }); return null;
  });
  const choice = isLyricsProvider(raw) ? raw : 'auto';
  choices.set(trackId, choice);
  log.player('lyrics provider choice loaded', { trackId, provider: choice });
  return choice;
};

export const setTrackLyricsProvider = async (trackId: string, provider: LyricsProviderSelection) => {
  const write = choiceWrites.then(async () => {
    const finish = log.time('player', 'lyrics provider choice save', { trackId, provider });
    try {
      await AsyncStorage.setItem(`${PREFIX}choice:${trackId}`, provider);
      choices.set(trackId, provider);
      finish({ ok: true, trackId, provider });
    } catch (error) { finish({ ok: false, trackId, provider, error: String(error) }); throw error; }
  });
  choiceWrites = write.catch(() => {});
  return write;
};

const persistResult = (key: string, lyrics: LyricsData) => {
  const write = cacheWrites.then(async () => {
    const indexKey = `${PREFIX}index`;
    const raw = await AsyncStorage.getItem(indexKey);
    let saved: unknown = [];
    try { saved = raw ? JSON.parse(raw) : []; } catch (error) { log.error('lyrics cache index repaired', error); }
    const keys = Array.isArray(saved) ? saved.filter((entry): entry is string =>
      typeof entry === 'string' && entry.startsWith(`${PREFIX}result:`) && entry !== key) : [];
    keys.push(key);
    const evicted = keys.splice(0, Math.max(0, keys.length - MAX_CACHE));
    await AsyncStorage.multiSet([[key, JSON.stringify({ savedAt: Date.now(), lyrics })], [indexKey, JSON.stringify(keys)]]);
    if (evicted.length) await AsyncStorage.multiRemove(evicted);
    log.player('lyrics cache persisted', { ...summary(lyrics), evicted: evicted.length });
  }).catch((error) => log.error('lyrics cache write failed', error));
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
const candidateMatches = (hit: Record<string, any>, query: Query) =>
  isCanonicalLyricsCandidate({ trackName: hit.title || hit.track_name || hit.song,
    artistName: hit.artist || hit.artist_name, duration: Number(hit.duration) || undefined },
  query.trackName, query.artistName, query.durationMs);

const fetchLyricsPlus = async (query: Query, signal: AbortSignal) => {
  const hosts = lastLyricsPlusHost ? [lastLyricsPlusHost, ...LYRICS_PLUS_HOSTS.filter((host) => host !== lastLyricsPlusHost)] : LYRICS_PLUS_HOSTS;
  const controllers = hosts.map(() => new AbortController());
  const pending = new Map<number, Promise<{ index: number; parsed: ReturnType<typeof parseLyricsPayload>; error?: unknown }>>();
  let lastError: unknown;
  let answered = false;
  let cancel!: () => void;
  const aborted = new Promise<{ index: number; parsed: null }>((resolve) => {
    cancel = () => { controllers.forEach((controller) => controller.abort()); resolve({ index: -1, parsed: null }); };
    signal.addEventListener('abort', cancel, { once: true });
  });
  if (signal.aborted) { cancel(); signal.removeEventListener('abort', cancel); return null; }
  hosts.forEach((host, index) => {
    const endpoint = url(`${host}/v2/lyrics/get`, { title: query.trackName, artist: query.artistName,
      duration: query.durationMs >= 1000 ? Math.floor(query.durationMs / 1000) : undefined, album: query.albumName, isrc: query.isrc });
    pending.set(index, requestLyricsJson(endpoint, { provider: 'lyrics-plus', signal: controllers[index].signal, trackId: query.trackId })
      .then((payload) => ({ index, parsed: parseLyricsPayload(payload, query.durationMs) }))
      .catch((error) => ({ index, parsed: null, error })));
  });
  try {
    while (pending.size) {
      const result = await Promise.race([...pending.values(), aborted]);
      if (result.index < 0 || signal.aborted) return null;
      pending.delete(result.index);
      if ('error' in result && result.error) lastError = result.error;
      else answered = true;
      log.player('lyrics mirror result', { provider: 'lyrics-plus', host: hosts[result.index],
        found: Boolean(result.parsed), lines: result.parsed?.segments.length || 0 });
      if (result.parsed) {
        lastLyricsPlusHost = hosts[result.index];
        log.player('lyrics mirror selected', { provider: 'lyrics-plus', host: lastLyricsPlusHost });
        return result.parsed;
      }
    }
    if (!answered && lastError) throw lastError;
    return null;
  } finally { signal.removeEventListener('abort', cancel); controllers.forEach((controller) => controller.abort()); }
};

const fetchSource = async (source: LyricsProviderId, query: Query, signal: AbortSignal): Promise<LyricsData | null> => {
  const seconds = query.durationMs ? query.durationMs / 1000 : undefined;
  if (source === 'lrclib') return fetchLyricsFromLrclib(query.trackName, query.artistName, seconds, query.albumName, query.releaseDate, signal);
  if (source === 'letras') return fetchLyricsFromLetras(query.trackName, query.artistName, seconds, signal);
  const request = (endpoint: string) => requestLyricsText(endpoint, { provider: source, signal, trackId: query.trackId });
  const json = (endpoint: string) => requestLyricsJson(endpoint, { provider: source, signal, trackId: query.trackId }) as Promise<any>;
  let payload: unknown;
  let parsed: ReturnType<typeof parseLyricsPayload> = null;
  if (source === 'youtube') {
    if (!query.videoId) return null;
    const client = await getYouTubeMusicClient();
    if (signal.aborted) throw new Error('lyrics_cancelled');
    const shelf = await client.music.getLyrics?.(query.videoId);
    payload = getYouTubeMusicText(shelf?.description);
  } else if (source === 'better' || source === 'portato') {
    // The public cache keys use whole seconds, as in the reference client.
    payload = await request(url(`https://lyrics-api.boidu.dev/${source === 'portato' ? 'qq/' : ''}getLyrics`,
      { s: query.trackName, a: query.artistName, d: seconds && seconds >= 1 ? Math.floor(seconds) : undefined, al: query.albumName }));
  } else if (source === 'lyrics-plus') {
    parsed = await fetchLyricsPlus(query, signal);
  } else if (source === 'unison') {
    const result = await json(url('https://unison.boidu.dev/lyrics',
      { song: query.trackName, artist: query.artistName, duration: seconds, album: query.albumName }));
    if (!result?.success || !candidateMatches(result.data || {}, query)) return null;
    payload = result.data;
  } else if (source === 'lrc-red') {
    let isrc = query.isrc;
    if (!isrc) {
      const result = await json(url('https://lrc.red/search.json', { q: `${query.trackName} ${query.artistName}` }));
      const hits = (Array.isArray(result?.hits) ? result.hits : []).filter((hit: any) => candidateMatches(hit, query));
      hits.sort((a: any, b: any) => Math.abs(Number(a.duration) * 1000 - query.durationMs) - Math.abs(Number(b.duration) * 1000 - query.durationMs));
      isrc = hits[0]?.isrc;
      log.player('lyrics recording match', { provider: source, trackId: query.trackId,
        candidates: result?.hits?.length || 0, matches: hits.length, isrc });
    }
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(isrc || '')) return null;
    payload = await request(`https://lrc.red/s/${isrc!.toUpperCase()}.ttml`);
  } else if (source === 'bini') {
    const isrc = normalizeTrackIsrc(query.isrc);
    let result = await json(url('https://lyrics-api.binimum.org/', isrc ? { isrc } :
      { track: query.trackName, artist: query.artistName, duration: seconds, album: query.albumName }));
    if (!isrc && query.albumName && !result?.results?.length) {
      log.player('lyrics album constraint fallback', { provider: source, trackId: query.trackId });
      result = await json(url('https://lyrics-api.binimum.org/',
        { track: query.trackName, artist: query.artistName, duration: seconds }));
    }
    const hit = (Array.isArray(result?.results) ? result.results : []).find((item: any) =>
      isrc ? normalizeTrackIsrc(item.isrc) === isrc : candidateMatches(item, query));
    log.player('lyrics recording match', { provider: source, trackId: query.trackId,
      candidates: result?.results?.length || 0, matches: hit ? 1 : 0, isrc: hit?.isrc });
    if (!hit?.lyricsUrl) return null;
    const document = new URL(hit.lyricsUrl);
    if (document.protocol !== 'https:' || !['lrc.red', 'lyrics-api.binimum.org'].includes(document.hostname)) {
      log.error('lyrics document host rejected', { provider: source, host: document.hostname }); return null;
    }
    payload = await request(document.toString());
  }
  parsed ??= parseLyricsPayload(payload, query.durationMs);
  log.player('lyrics parsing result', { ...summary(parsed ? { ...parsed, source, isSynced: parsed.segments.length > 0 } : null),
    provider: source, trackId: query.trackId, recognized: Boolean(parsed),
    outcome: parsed ? parsed.segments.length ? 'timed' : 'plain' : payload == null ? 'empty' : 'unrecognized',
    firstStartMs: parsed?.segments[0]?.startTimeMs, lastEndMs: parsed?.segments.at(-1)?.endTimeMs });
  return parsed ? { ...parsed, trackName: query.trackName, artistName: query.artistName,
    isSynced: parsed.segments.length > 0, source } : null;
};

/** Providers race independently, but selection honors persisted priority and explicit choice. */
const lookupProviderLyrics = async (query: Query): Promise<LyricsData | null> => {
  const settings = getCachedAppSettings();
  if (!settings.lyricsEnabled || query.signal?.aborted) {
    log.player('lyrics lookup skipped', { enabled: settings.lyricsEnabled, cancelled: query.signal?.aborted }); return null;
  }
  const trackId = query.trackId || JSON.stringify([query.trackName, query.artistName, query.durationMs]);
  const selection = query.provider ?? await getTrackLyricsProvider(trackId);
  const sequence = (selection === 'auto' ? settings.lyricsSourceOrder : [selection])
    .filter((source) => !settings.lyricsDisabledSources.includes(source));
  const identity = JSON.stringify([FORMAT_VERSION, trackId, query.videoId, query.trackName, query.artistName, query.durationMs,
    query.albumName, query.isrc, selection, lyricsPolicyKey()]);
  const key = `${PREFIX}result:${identity}`;
  let cached = cache.get(key);
  let layer = 'memory';
  if (!cached) {
    try {
      const stored = await AsyncStorage.getItem(key);
      const saved = stored ? JSON.parse(stored) : null;
      if (saved?.savedAt > Date.now() - 7 * 24 * 60 * 60_000 && saved?.lyrics?.source &&
        Array.isArray(saved.lyrics.segments)) { cached = saved.lyrics; layer = 'storage'; }
    } catch (error) { log.error('lyrics cache read failed', { trackId, error }); }
  }
  if (cached && (!query.force || query.offline) && sequence.includes(cached.source as LyricsProviderId)) {
    query.onAttempt?.(cached.source as LyricsProviderId, 'found');
    log.player('lyrics cache hit', { trackId, selection, layer, ...summary(cached) });
    return cached;
  }
  if (query.signal?.aborted) return null;
  if (query.offline) {
    const saved = await getOfflineLyrics(trackId);
    log.player('lyrics offline lookup', { trackId, selection, found: Boolean(saved), ...summary(saved) });
    return saved && sequence.includes(saved.source as LyricsProviderId) ? saved : null;
  }
  const search = lyricsSearchIdentity(query.trackName, query.artistName);
  const lookup = { ...query, trackName: search.title, artistName: search.artist };
  log.player('lyrics query prepared', { trackId, platform: Platform.OS, originalTitle: query.trackName,
    originalArtists: query.artistName, searchTitle: search.title, searchArtist: search.artist,
    durationMs: query.durationMs, album: query.albumName, isrc: query.isrc, selection, sources: sequence });
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
    const finish = log.time('player', 'lyrics provider attempt', { trackId, provider: source, platform: Platform.OS });
    let timedOut = false;
    publish(source, 'loading');
    const timeout = new Promise<null>((resolve) => {
      timers.push(setTimeout(() => { timedOut = true; controller.abort(); resolve(null); }, 8000));
    });
    const aborted = new Promise<null>((resolve) => {
      if (controller.signal.aborted) resolve(null);
      else controller.signal.addEventListener('abort', () => resolve(null), { once: true });
    });
    return Promise.race([fetchSource(source, lookup, controller.signal), timeout, aborted]).then((result) => {
      const cancelled = finished || query.signal?.aborted;
      finish({ trackId, ...summary(result), provider: source, ok: !timedOut,
        outcome: cancelled ? 'cancelled' : timedOut ? 'timeout' : result ? 'found' : 'missing' });
      if (!finished && !query.signal?.aborted) publish(source, timedOut ? 'timeout' : result ? 'found' : 'missing');
      return result;
    }).catch((error) => {
      finish({ trackId, provider: source, ok: false, outcome: 'error', error: String(error) });
      if (!controller.signal.aborted) log.error('lyrics provider failed', { trackId, provider: source, error });
      if (!finished && !query.signal?.aborted) publish(source,
        error instanceof LyricsHttpError && [401, 403].includes(error.status) ? 'restricted' : 'error');
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
    if (fallback) fallback = { ...fallback, trackName: query.trackName, artistName: query.artistName };
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

export const fetchProviderLyrics = async (query: Query): Promise<LyricsData | null> => {
  const finish = log.time('player', 'lyrics lookup', { trackId: query.trackId, title: query.trackName,
    artists: query.artistName, provider: query.provider || 'saved-choice', force: Boolean(query.force), offline: Boolean(query.offline) });
  try {
    const result = await lookupProviderLyrics(query);
    finish({ ok: true, trackId: query.trackId, ...summary(result), found: Boolean(result), cancelled: Boolean(query.signal?.aborted) });
    return result;
  } catch (error) { finish({ ok: false, trackId: query.trackId, error: String(error) }); throw error; }
};

/** Availability discovery never changes the selected provider or the playing track. */
export const probeLyricsProviders = async (query: Query,
  onFound: (provider: LyricsProviderId, lyrics: LyricsData) => void) => {
  const settings = getCachedAppSettings();
  if (!settings.lyricsEnabled || query.signal?.aborted) return;
  const sources = settings.lyricsSourceOrder.filter((source) => !settings.lyricsDisabledSources.includes(source));
  const finish = log.time('player', 'lyrics provider availability', { trackId: query.trackId, sources });
  let cursor = 0, found = 0;
  const worker = async () => {
    while (cursor < sources.length && !query.signal?.aborted) {
      const provider = sources[cursor++];
      const lyrics = await fetchProviderLyrics({ ...query, provider, onAttempt: undefined }).catch((error) => {
        if (!query.signal?.aborted) log.error('lyrics availability probe failed', { provider, error });
        return null;
      });
      if (lyrics && !query.signal?.aborted) { found += 1; onFound(provider, lyrics); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, sources.length) }, worker));
  finish({ ok: true, found, cancelled: Boolean(query.signal?.aborted) });
};
