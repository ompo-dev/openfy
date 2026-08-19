/**
 * Lyrics Service
 * Multi-Engine Lyrics Provider:
 * 1. LRCLIB (Synchronized LRC Karaokê & Timestamps)
 * 2. Letras.mus.br (Complete Brazilian & International Lyrics database + Video metadata)
 * 3. Vagalume API (Fast Plain text fallback)
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  source?: 'lrclib' | 'letras' | 'vagalume';
};

const LYRICS_DIR = `${FileSystem.documentDirectory || ''}openfy_lyrics/`;

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
 * Fetch lyrics from Letras.mus.br
 */
export const fetchLyricsFromLetras = async (
  trackName: string,
  artistName: string
): Promise<LyricsData | null> => {
  try {
    const query = `${artistName} ${trackName}`.trim();
    const searchUrl = `https://solr.sscdn.co/letras/m1/?q=${encodeURIComponent(query)}`;

    let targetUrl = searchUrl;
    if (Platform.OS === 'web' && !searchUrl.includes('localhost')) {
      targetUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
    }

    const res = await fetch(targetUrl);
    if (!res.ok) return null;

    const raw = await res.text();
    const cleanJson = raw.replace(/^LetrasSug\(/, '').replace(/\);?$/, '');
    const data = JSON.parse(cleanJson);
    const docs = data.response?.docs || [];

    if (docs.length === 0) return null;

    const doc = docs[0];
    if (!doc.dns || !doc.url) return null;

    const pageUrl = `https://www.letras.mus.br/${doc.dns}/${doc.url}/`;
    let targetPageUrl = pageUrl;
    if (Platform.OS === 'web') {
      targetPageUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`;
    }

    const pageRes = await fetch(targetPageUrl);
    if (!pageRes.ok) return null;

    const html = await pageRes.text();
    const m = html.match(/<div class="lyric-original">([\s\S]*?)<\/div>/);
    if (m) {
      const plain = m[1]
        .replace(/<p>/g, '\n')
        .replace(/<\/p>/g, '\n')
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();

      if (plain.length > 10) {
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
  } catch (err) {
    console.warn('[LyricsService] Letras.mus.br lookup failed:', err);
  }
  return null;
};

/**
 * Main fetch lyrics dispatcher with multi-provider fallback
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
  const primaryArtist = isUnknown ? '' : artistName.split(',')[0].split('&')[0].trim();
  const durationMs = durationSeconds ? Math.round(durationSeconds * 1000) : undefined;

  // 1. PRIMARY: Try exact synchronized match on LRCLIB
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

    let url = `https://lrclib.net/api/get?${params.toString()}`;
    if (Platform.OS === 'web') {
      url = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Openfy-App/1.0 (https://github.com/openfy)' },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        id?: number;
        trackName: string;
        artistName: string;
        plainLyrics?: string;
        syncedLyrics?: string;
      };

      if (data.syncedLyrics && data.syncedLyrics.trim().length > 0) {
        const segments = parseLrcToSegments(data.syncedLyrics, durationMs);
        if (segments.length > 0) {
          return {
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

      if (data.plainLyrics && data.plainLyrics.trim().length > 0) {
        return {
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

  // 2. SECONDARY: Search query fallback on LRCLIB
  try {
    let searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(
      primaryArtist ? `${primaryArtist} ${cleanTrack}` : cleanTrack
    )}`;
    if (Platform.OS === 'web') {
      searchUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
    }

    const sRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Openfy-App/1.0 (https://github.com/openfy)' },
    });

    if (sRes.ok) {
      const sData = (await sRes.json()) as {
        id?: number;
        trackName: string;
        artistName: string;
        plainLyrics?: string;
        syncedLyrics?: string;
      }[];

      if (Array.isArray(sData) && sData.length > 0) {
        const matchedSynced = sData.find(
          (item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0
        );
        if (matchedSynced?.syncedLyrics) {
          const segments = parseLrcToSegments(matchedSynced.syncedLyrics, durationMs);
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

        const matchedPlain = sData.find(
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

  // 3. TERTIARY: Letras.mus.br Full Lyrics Scraper
  const letrasData = await fetchLyricsFromLetras(cleanTrack, primaryArtist || artistName);
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
