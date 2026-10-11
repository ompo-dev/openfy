/**
 * Lyrics Service
 * Common lyric contracts, LRC parsing and legacy offline storage.
 * Provider orchestration and per-recording choices live in lyricsRepository.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasCanonicalArtistMatch,
  hasConflictingNumberedTitleInLyrics,
  hasCanonicalTitleMatch,
} from '../canonical/canonicalMatcher';

export type LyricSegment = {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  words?: { text: string; startTimeMs: number; endTimeMs: number }[];
};

export type LyricsData = {
  id?: number | string;
  trackName: string;
  artistName: string;
  plainLyrics?: string;
  syncedLyrics?: string;
  segments: LyricSegment[];
  isSynced: boolean;
  source?: 'backend' | 'vagalume' | 'user' | import('./lyricsSources').LyricsProviderId;
  timeOffsetMs?: number;
};

const LYRICS_DIR = `${FileSystem.documentDirectory || ''}openfy_lyrics/`;

type LyricsCandidateIdentity = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  durationMs?: number;
  albumName?: string;
  releaseDate?: string;
};

type LyricTitleMatch = {
  matches: boolean;
  isRelaxed: boolean;
};

// Provider catalogues often omit production credits, but stripping every
// hyphenated suffix turns different songs into the same lookup ("ESCANOR" was
// previously enough to return another 7 Minutoz release). Keep the complete
// title as the identity and only use the base title as a guarded fallback.
const getLyricTitleVariants = (trackName: string): string[] => {
  const fullTitle = (trackName || '').trim();
  const withoutProductionCredit = fullTitle
    .replace(
      /\s*[\[(]\s*(?:prod(?:\.|ução)?|produced by)(?=\s|$)[^\])]*[\])]/gi,
      ''
    )
    .trim();
  return [...new Set([fullTitle, withoutProductionCredit].filter(Boolean))];
};

const getTitleWithoutProductionCredit = (trackName: string): string =>
  (trackName || '')
    .trim()
    .replace(
      /\s*[\[(]\s*(?:prod(?:\.|ução)?|produced by)(?=\s|$)[^\])]*[\])]/gi,
      ''
    )
    .trim();

const getLyricTitleMatch = (
  candidateTitle: string,
  trackName: string
): LyricTitleMatch => {
  const fullTitle = (trackName || '').trim();
  const titleWithoutProductionCredit =
    getTitleWithoutProductionCredit(trackName);

  if (
    (fullTitle && hasCanonicalTitleMatch(candidateTitle, fullTitle)) ||
    (titleWithoutProductionCredit &&
      hasCanonicalTitleMatch(candidateTitle, titleWithoutProductionCredit))
  ) {
    return { matches: true, isRelaxed: false };
  }

  // Some catalogues shorten a credited release to its base title. Accept that
  // only as a relaxed match; the caller then requires a near-exact duration.
  const baseTitle = titleWithoutProductionCredit.split(/\s+-\s+/)[0]?.trim();
  if (baseTitle && hasCanonicalTitleMatch(candidateTitle, baseTitle)) {
    return { matches: true, isRelaxed: true };
  }

  return { matches: false, isRelaxed: false };
};

const hasConflictingLyricsTitle = (
  lyrics: string | undefined,
  trackName: string
): boolean =>
  getLyricTitleVariants(trackName).some((title) =>
    hasConflictingNumberedTitleInLyrics(lyrics, title)
  );

export const isCanonicalLyricsCandidate = (
  candidate: LyricsCandidateIdentity,
  trackName: string,
  artistName: string,
  durationMs: number
): boolean => {
  const titleMatch = getLyricTitleMatch(candidate.trackName || '', trackName);
  if (!titleMatch.matches) {
    return false;
  }

  if (
    artistName &&
    !hasCanonicalArtistMatch(
      candidate.trackName || '',
      candidate.artistName || '',
      artistName
    )
  ) {
    return false;
  }

  const candidateDurationMs =
    candidate.durationMs || (candidate.duration || 0) * 1000;
  // A base-title match such as "Escanor" is ambiguous. Without an accurate
  // duration we cannot prove that it is the credited release, so omit lyrics
  // rather than attach a different song's text.
  if (!durationMs || !candidateDurationMs) return !titleMatch.isRelaxed;

  const durationToleranceMs = titleMatch.isRelaxed
    ? Math.max(3000, durationMs * 0.02)
    : Math.max(10000, durationMs * 0.1);

  return Math.abs(candidateDurationMs - durationMs) <= durationToleranceMs;
};

export const ensureLyricsDirectory = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    const info = await FileSystem.getInfoAsync(LYRICS_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(LYRICS_DIR, { intermediates: true });
    }
  } catch {}
};

/**
 * Parse standard LRC format string into JSON time-segments [startTimeMs, endTimeMs]
 */
export const parseLrcToSegments = (
  lrcString: string,
  totalDurationMs?: number
): LyricSegment[] => {
  if (!lrcString) return [];

  const lines = lrcString.split('\n');
  const raw: { timeMs: number; text: string; words?: LyricSegment['words'] }[] = [];
  const offset = Number(lrcString.match(/\[offset:([+-]?\d+)\]/i)?.[1]) || 0;
  const time = (minutes: string, seconds: string, fraction?: string) =>
    Number(minutes) * 60000 + Number(seconds) * 1000 + Number((fraction || '').padEnd(3, '0').slice(0, 3)) + offset;

  for (const rawLine of lines) {
    const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const body = rawLine.slice(stamps.at(-1)!.index! + stamps.at(-1)![0].length);
    const text = body.replace(/<\d{1,3}:\d{2}(?:\.\d{1,3})?>/g, '').trim();
    if (!text) continue;
    const wordStamps = [...body.matchAll(/<(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?>/g)];
    const words = wordStamps.flatMap((stamp, index) => {
      const start = time(stamp[1], stamp[2], stamp[3]);
      const next = wordStamps[index + 1];
      const word = body.slice(stamp.index! + stamp[0].length, next?.index ?? body.length);
      const end = next ? time(next[1], next[2], next[3]) : totalDurationMs || start + 5000;
      return word.trim() && end > start ? [{ text: word, startTimeMs: Math.max(0, start), endTimeMs: end }] : [];
    });
    stamps.forEach((stamp, index) => raw.push({ timeMs: Math.max(0, time(stamp[1], stamp[2], stamp[3])), text,
      ...(index === 0 && words.length ? { words } : {}) }));
  }

  if (raw.length === 0) return [];

  raw.sort((a, b) => a.timeMs - b.timeMs);

  return raw.map((item, i) => {
    const startTimeMs = item.timeMs;
    const nextItem = raw[i + 1];
    const endTimeMs = nextItem
      ? nextItem.timeMs
      : totalDurationMs && totalDurationMs > startTimeMs
        ? totalDurationMs
        : startTimeMs + 5000;

    return {
      index: i,
      startTimeMs,
      endTimeMs,
      text: item.text,
      ...(item.words?.length ? { words: item.words.map((word) => ({ ...word, endTimeMs: Math.min(endTimeMs, word.endTimeMs) })) } : {}),
    };
  });
};

/**
 * Fetch lyrics from Letras.mus.br (Fallback for native environments)
 */
export const fetchLyricsFromLetras = async (
  trackName: string,
  artistName: string,
  durationSeconds?: number,
  signal?: AbortSignal
): Promise<LyricsData | null> => {
  try {
    const cleanA = (artistName || '')
      .replace(/\(.*\)/g, '')
      .replace(/,.*/g, '')
      .trim();
    const queries = getLyricTitleVariants(trackName).flatMap((title) => [
      `${cleanA} ${title}`,
      title,
      `${title} ${cleanA}`,
    ]);

    for (const query of queries) {
      const searchUrl = `https://solr.sscdn.co/letras/m1/?q=${encodeURIComponent(query)}`;

      const res = await fetch(searchUrl, {
        signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;

      const raw = await res.text();
      const match = raw.match(/LetrasSug\(([\s\S]*)\)/);
      if (!match) continue;

      const data = JSON.parse(match[1]);
      const docs = data.response?.docs || [];
      if (docs.length === 0) continue;

      for (const doc of docs.slice(0, 3)) {
        if (!doc.dns || !doc.url) continue;

        if (
          !isCanonicalLyricsCandidate(
            {
              trackName: `${doc.txt || ''} ${doc.url || ''}`,
              artistName: doc.art,
            },
            trackName,
            artistName,
            Math.round((durationSeconds || 0) * 1000)
          )
        ) {
          continue;
        }

        const pageUrl = `https://www.letras.mus.br/${doc.dns}/${doc.url}/`;
        const pageRes = await fetch(pageUrl, {
          signal,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!pageRes.ok) continue;

        const html = await pageRes.text();
        const m =
          html.match(/<div class="lyric-original"[^>]*>([\s\S]*?)<\/div>/i) ||
          html.match(/<div class="cnt-letra"[^>]*>([\s\S]*?)<\/div>/i);
        if (m) {
          const plain = m[1]
            .replace(/<p>/g, '')
            .replace(/<\/p>/g, '\n\n')
            .replace(/<br\s*[\/]?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();

          if (plain.length > 20) {
            return {
              id: doc.id || `letras_${doc.dns}`,
              trackName: doc.txt || trackName,
              artistName: doc.art || artistName,
              plainLyrics: plain,
              segments: [],
              isSynced: false,
              source: 'letras',
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[LyricsService] Letras.mus.br lookup failed:', err);
  }
  return null;
};

/**
 * Main fetch lyrics dispatcher with multi-provider fallback
 */
export const fetchLyricsFromLrclib = async (
  trackName: string,
  artistName: string,
  durationSeconds?: number,
  albumName?: string,
  releaseDate?: string,
  signal?: AbortSignal
): Promise<LyricsData | null> => {
  const isUnknown =
    !artistName ||
    artistName.toLowerCase() === 'artista' ||
    artistName.toLowerCase().includes('unknown');

  const primaryArtist = isUnknown
    ? ''
    : artistName.split(',')[0].split('&')[0].trim();
  const durationMs = durationSeconds ? Math.round(durationSeconds * 1000) : 0;

  let exactLyrics: LyricsData | null = null;

  // Keep direct exact result as a fallback. Search has better disambiguation
  // for separate tracks with similar titles.
  try {
    const params = new URLSearchParams({
      track_name: trackName,
    });
    if (primaryArtist) {
      params.append('artist_name', primaryArtist);
    }
    if (durationSeconds && durationSeconds > 0) {
      params.append('duration', Math.round(durationSeconds).toString());
    }

    const url = `https://lrclib.net/api/get?${params.toString()}`;
    const res = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'Openfy-App/1.0 (https://github.com/openfy)' },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        id?: number;
        trackName: string;
        artistName: string;
        duration?: number;
        plainLyrics?: string;
        syncedLyrics?: string;
      };

      if (
        isCanonicalLyricsCandidate(
          data,
          trackName,
          primaryArtist || artistName,
          durationMs
        ) &&
        data.syncedLyrics &&
        !hasConflictingLyricsTitle(data.syncedLyrics, trackName) &&
        data.syncedLyrics.trim().length > 0
      ) {
        const segments = parseLrcToSegments(data.syncedLyrics, durationMs);
        if (segments.length > 0) {
          exactLyrics = {
            id: data.id,
            trackName: data.trackName || trackName,
            artistName: data.artistName || artistName,
            plainLyrics: data.plainLyrics,
            syncedLyrics: data.syncedLyrics,
            segments,
            isSynced: true,
            source: 'lrclib',
          };
        }
      }

      if (
        isCanonicalLyricsCandidate(
          data,
          trackName,
          primaryArtist || artistName,
          durationMs
        ) &&
        !exactLyrics &&
        data.plainLyrics &&
        !hasConflictingLyricsTitle(data.plainLyrics, trackName) &&
        data.plainLyrics.trim().length > 0
      ) {
        exactLyrics = {
          id: data.id,
          trackName: data.trackName || trackName,
          artistName: data.artistName || artistName,
          plainLyrics: data.plainLyrics,
          segments: [],
          isSynced: false,
          source: 'lrclib',
        };
      }
    }
  } catch (error) {
    console.warn('[LyricsService] Exact lookup error:', error);
  }

  // 3. TERTIARY: Search query fallback on LRCLIB
  try {
    for (const lookupTitle of getLyricTitleVariants(trackName)) {
      const query = primaryArtist
        ? `${primaryArtist} ${lookupTitle}`
        : lookupTitle;
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
      const sRes = await fetch(searchUrl, {
        signal,
        headers: { 'User-Agent': 'Openfy-App/1.0 (https://github.com/openfy)' },
      });

      if (!sRes.ok) continue;
      const sData = (await sRes.json()) as {
        id?: number;
        trackName: string;
        artistName: string;
        duration?: number;
        plainLyrics?: string;
        syncedLyrics?: string;
      }[];

      if (Array.isArray(sData) && sData.length > 0) {
        const matchedCandidates = sData.filter(
          (item) =>
            isCanonicalLyricsCandidate(
              item,
              trackName,
              primaryArtist || artistName,
              durationMs
            ) &&
            !hasConflictingLyricsTitle(
              item.syncedLyrics || item.plainLyrics,
              trackName
            )
        );
        const matchedSynced = matchedCandidates.find(
          (item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0
        );
        if (matchedSynced?.syncedLyrics) {
          const segments = parseLrcToSegments(
            matchedSynced.syncedLyrics,
            durationMs
          );
          if (segments.length > 0) {
            return {
              id: matchedSynced.id,
              trackName: matchedSynced.trackName || trackName,
              artistName: matchedSynced.artistName || artistName,
              plainLyrics: matchedSynced.plainLyrics,
              syncedLyrics: matchedSynced.syncedLyrics,
              segments,
              isSynced: true,
              source: 'lrclib',
            };
          }
        }

        const matchedPlain = matchedCandidates.find(
          (item) => item.plainLyrics && item.plainLyrics.trim().length > 0
        );
        if (matchedPlain?.plainLyrics) {
          return {
            id: matchedPlain.id,
            trackName: matchedPlain.trackName || trackName,
            artistName: matchedPlain.artistName || artistName,
            plainLyrics: matchedPlain.plainLyrics,
            segments: [],
            isSynced: false,
            source: 'lrclib',
          };
        }
      }
    }
  } catch (error) {
    console.warn('[LyricsService] Search fallback error:', error);
  }

  if (exactLyrics) return exactLyrics;

  return null;
};

export type LyricsFetchOptions = {
  force?: boolean;
  offline?: boolean;
  trackId?: string;
  videoId?: string;
  isrc?: string;
  provider?: import('./lyricsSources').LyricsProviderSelection;
  signal?: AbortSignal;
  onAttempt?: (provider: import('./lyricsSources').LyricsProviderId, status: import('./lyricsSources').LyricsProviderStatus) => void;
};

export const fetchLyrics = async (
  trackName: string, artistName: string, durationSeconds?: number,
  albumName?: string, releaseDate?: string, options?: LyricsFetchOptions,
): Promise<LyricsData | null> => {
  const { fetchProviderLyrics } = await import('./lyricsRepository');
  return fetchProviderLyrics({ trackName, artistName, durationMs: Math.round((durationSeconds || 0) * 1000),
    albumName, releaseDate, ...options });
};

/**
 * Save lyrics locally for offline access
 */
export const saveLyricsOffline = async (
  trackId: string,
  lyrics: LyricsData
): Promise<string | null> => {
  try {
    const key = `lyrics_${trackId}`;
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, JSON.stringify(lyrics));
      return key;
    }

    await ensureLyricsDirectory();
    const filePath = `${LYRICS_DIR}${trackId}.json`;
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(lyrics));
    await AsyncStorage.setItem(key, JSON.stringify(lyrics));
    return filePath;
  } catch {
    return null;
  }
};

/**
 * Load offline saved lyrics
 */
export const getOfflineLyrics = async (
  trackId: string
): Promise<LyricsData | null> => {
  try {
    const key = `lyrics_${trackId}`;
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as LyricsData;
    }

    if (Platform.OS !== 'web') {
      const filePath = `${LYRICS_DIR}${trackId}.json`;
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(filePath);
        return JSON.parse(content) as LyricsData;
      }
    }

    return null;
  } catch {
    return null;
  }
};
