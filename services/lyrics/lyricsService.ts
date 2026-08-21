/**
 * Lyrics Service
 * Multi-Engine Lyrics Provider:
 * 1. Openfy Backend Engine (/api/lyrics - LRCLIB + Letras.mus.br + Genius)
 * 2. LRCLIB (Synchronized LRC Karaokê & Timestamps)
 * 3. Letras.mus.br (Complete Brazilian & International Lyrics database)
 * 4. Offline Cache & Fallback System
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MUSIC_SERVER_URL } from '@config';
import { fetchWithTimeout } from '@utils';
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
};

export type LyricsData = {
  id?: number | string;
  trackName: string;
  artistName: string;
  plainLyrics?: string;
  syncedLyrics?: string;
  segments: LyricSegment[];
  isSynced: boolean;
  source?: 'backend' | 'lrclib' | 'letras' | 'vagalume';
  timeOffsetMs?: number;
};

export const createEstimatedLyricSegments = (
  plainLyrics: string | undefined,
  durationMs: number
): LyricSegment[] => {
  if (!plainLyrics || durationMs <= 0) return [];

  const lines = plainLyrics
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const startOffsetMs = Math.min(2500, Math.round(durationMs * 0.04));
  const availableMs = Math.max(0, durationMs - startOffsetMs);
  const weights = lines.map((line) => Math.max(1, line.split(/\s+/).length));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let startTimeMs = startOffsetMs;

  return lines.map((text, index) => {
    const nextStartMs =
      index === lines.length - 1
        ? durationMs
        : startTimeMs + (availableMs * weights[index]) / totalWeight;
    const segment = {
      index,
      startTimeMs: Math.round(startTimeMs),
      endTimeMs: Math.round(nextStartMs),
      text,
    };
    startTimeMs = nextStartMs;
    return segment;
  });
};

const LYRICS_DIR = `${FileSystem.documentDirectory || ''}openfy_lyrics/`;

type LyricsCandidateIdentity = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  durationMs?: number;
};

const isCanonicalLyricsCandidate = (
  candidate: LyricsCandidateIdentity,
  trackName: string,
  artistName: string,
  durationMs: number
): boolean => {
  if (!hasCanonicalTitleMatch(candidate.trackName || '', trackName)) {
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
  if (!durationMs || !candidateDurationMs) return true;

  return (
    Math.abs(candidateDurationMs - durationMs) <=
    Math.max(10000, durationMs * 0.1)
  );
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
  const raw: { timeMs: number; text: string }[] = [];

  const regex = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\](.*)/;

  for (const rawLine of lines) {
    const match = rawLine.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fraction = match[3]
        ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10)
        : 0;

      const timeMs = minutes * 60 * 1000 + seconds * 1000 + fraction;
      const text = match[4].trim();

      if (text) {
        raw.push({ timeMs, text });
      }
    }
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
    };
  });
};

/**
 * Fetch lyrics from Letras.mus.br (Fallback for native environments)
 */
export const fetchLyricsFromLetras = async (
  trackName: string,
  artistName: string,
  durationSeconds?: number
): Promise<LyricsData | null> => {
  try {
    const cleanT = (trackName || '')
      .replace(/\(.*\)/g, '')
      .replace(/-.*/g, '')
      .trim();
    const cleanA = (artistName || '')
      .replace(/\(.*\)/g, '')
      .replace(/,.*/g, '')
      .trim();
    const queries = [`${cleanA} ${cleanT}`, cleanT, `${cleanT} ${cleanA}`];

    for (const query of queries) {
      const searchUrl = `https://solr.sscdn.co/letras/m1/?q=${encodeURIComponent(query)}`;

      const res = await fetch(searchUrl, {
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
            0
          )
        ) {
          continue;
        }

        const pageUrl = `https://www.letras.mus.br/${doc.dns}/${doc.url}/`;
        const pageRes = await fetch(pageUrl, {
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
            const segments = createEstimatedLyricSegments(
              plain,
              Math.round((durationSeconds || 0) * 1000)
            );
            return {
              id: doc.id || `letras_${doc.dns}`,
              trackName: doc.txt || trackName,
              artistName: doc.art || artistName,
              plainLyrics: plain,
              segments,
              isSynced: segments.length > 0,
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
 * Main fetch lyrics dispatcher with backend proxy + multi-provider fallback
 */
export const fetchLyrics = async (
  trackName: string,
  artistName: string,
  durationSeconds?: number
): Promise<LyricsData | null> => {
  const isUnknown =
    !artistName ||
    artistName.toLowerCase() === 'artista' ||
    artistName.toLowerCase().includes('unknown');

  const cleanTrack = trackName.split('(')[0].split('-')[0].trim();
  const primaryArtist = isUnknown
    ? ''
    : artistName.split(',')[0].split('&')[0].trim();
  const durationMs = durationSeconds ? Math.round(durationSeconds * 1000) : 0;

  // 1. PRIMARY: Query dedicated Openfy Backend (/api/lyrics)
  try {
    const backendParams = new URLSearchParams({
      title: cleanTrack,
      artist: primaryArtist || artistName,
      ...(durationMs > 0 ? { durationMs: String(durationMs) } : {}),
    });

    if (!MUSIC_SERVER_URL) throw new Error('Music server unavailable');
    const backendUrl = `${MUSIC_SERVER_URL}/api/lyrics?${backendParams.toString()}`;
    const bRes = await fetchWithTimeout(backendUrl, {}, 8000);
    if (bRes.ok) {
      const bData = await bRes.json();
      if (
        bData?.valid &&
        isCanonicalLyricsCandidate(
          {
            trackName: bData.trackName,
            artistName: bData.artistName,
            durationMs: bData.durationMs,
          },
          cleanTrack,
          primaryArtist || artistName,
          durationMs
        ) &&
        !hasConflictingNumberedTitleInLyrics(
          bData.syncedLyrics || bData.plainLyrics,
          cleanTrack
        )
      ) {
        let segments: LyricSegment[] = [];
        if (bData.syncedLyrics) {
          segments = parseLrcToSegments(bData.syncedLyrics, durationMs);
        } else if (Array.isArray(bData.lines) && bData.lines.length > 0) {
          segments = bData.lines.map((l: any, i: number) => ({
            index: i,
            startTimeMs: l.startMs,
            endTimeMs: bData.lines[i + 1]?.startMs || l.startMs + 4000,
            text: l.text,
          }));
        }

        return {
          id: `lyrics_${cleanTrack}`,
          trackName: bData.trackName || trackName,
          artistName: bData.artistName || artistName,
          plainLyrics: bData.plainLyrics,
          syncedLyrics: bData.syncedLyrics,
          segments,
          isSynced: segments.length > 0,
          source: 'backend',
        };
      }
    }
  } catch {}

  let exactLyrics: LyricsData | null = null;

  // Keep direct exact result as a fallback. Search has better disambiguation
  // for separate tracks with similar titles.
  try {
    const params = new URLSearchParams({
      track_name: cleanTrack,
    });
    if (primaryArtist) {
      params.append('artist_name', primaryArtist);
    }
    if (durationSeconds && durationSeconds > 0) {
      params.append('duration', Math.round(durationSeconds).toString());
    }

    const url = `https://lrclib.net/api/get?${params.toString()}`;
    const res = await fetch(url, {
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
          cleanTrack,
          primaryArtist || artistName,
          durationMs
        ) &&
        data.syncedLyrics &&
        !hasConflictingNumberedTitleInLyrics(data.syncedLyrics, cleanTrack) &&
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
          cleanTrack,
          primaryArtist || artistName,
          durationMs
        ) &&
        !exactLyrics &&
        data.plainLyrics &&
        !hasConflictingNumberedTitleInLyrics(data.plainLyrics, cleanTrack) &&
        data.plainLyrics.trim().length > 0
      ) {
        const segments = createEstimatedLyricSegments(
          data.plainLyrics,
          durationMs
        );
        exactLyrics = {
          id: data.id,
          trackName: data.trackName || trackName,
          artistName: data.artistName || artistName,
          plainLyrics: data.plainLyrics,
          segments,
          isSynced: segments.length > 0,
          source: 'lrclib',
        };
      }
    }
  } catch (error) {
    console.warn('[LyricsService] Exact lookup error:', error);
  }

  // 3. TERTIARY: Search query fallback on LRCLIB
  try {
    const query = primaryArtist ? `${primaryArtist} ${cleanTrack}` : cleanTrack;
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;

    const sRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Openfy-App/1.0 (https://github.com/openfy)' },
    });

    if (sRes.ok) {
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
              cleanTrack,
              primaryArtist || artistName,
              durationMs
            ) &&
            !hasConflictingNumberedTitleInLyrics(
              item.syncedLyrics || item.plainLyrics,
              cleanTrack
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
          const segments = createEstimatedLyricSegments(
            matchedPlain.plainLyrics,
            durationMs
          );
          return {
            id: matchedPlain.id,
            trackName: matchedPlain.trackName || trackName,
            artistName: matchedPlain.artistName || artistName,
            plainLyrics: matchedPlain.plainLyrics,
            segments,
            isSynced: segments.length > 0,
            source: 'lrclib',
          };
        }
      }
    }
  } catch (error) {
    console.warn('[LyricsService] Search fallback error:', error);
  }

  if (exactLyrics) return exactLyrics;

  // 4. QUATERNARY: Direct Letras.mus.br Scraper
  const letrasData = await fetchLyricsFromLetras(
    cleanTrack,
    primaryArtist || artistName,
    durationSeconds
  );
  if (letrasData) {
    return letrasData;
  }

  return null;
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
