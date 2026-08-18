/**
 * Lyrics Service
 * Fetches lyrics from LRCLIB.
 * Only marks lyrics as synced if genuine timestamped LRC format exists.
 * Otherwise delivers clean plain text lyrics without forced or fake timers.
 */

import * as FileSystem from 'expo-file-system/legacy';

export type LyricSegment = {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
};

export type LyricsData = {
  id?: number;
  trackName: string;
  artistName: string;
  plainLyrics?: string;
  syncedLyrics?: string;
  segments: LyricSegment[];
  isSynced: boolean;
};

const LYRICS_DIR = `${FileSystem.documentDirectory}openfy_lyrics/`;

export const ensureLyricsDirectory = async (): Promise<void> => {
  try {
    const info = await FileSystem.getInfoAsync(LYRICS_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(LYRICS_DIR, { intermediates: true });
    }
  } catch {}
};

/**
 * Parse standard LRC format string into genuine JSON time-segments [startTimeMs, endTimeMs]
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
 * Fetch lyrics from LRCLIB
 */
export const fetchLyrics = async (
  trackName: string,
  artistName: string,
  durationSeconds?: number
): Promise<LyricsData | null> => {
  const cleanTrack = trackName.split('(')[0].split('-')[0].trim();
  const primaryArtist = artistName.split(',')[0].split('&')[0].trim();
  const durationMs = durationSeconds ? Math.round(durationSeconds * 1000) : undefined;

  // 1. Try exact match on LRCLIB
  try {
    const params = new URLSearchParams({
      track_name: cleanTrack,
      artist_name: primaryArtist,
    });
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
        };
      }
    }
  } catch (error) {
    console.warn('[LyricsService] Exact lookup error:', error);
  }

  // 2. Search query fallback on LRCLIB
  try {
    const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(
      cleanTrack
    )}&artist_name=${encodeURIComponent(primaryArtist)}`;

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
        const matchedSynced = sData.find((item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0);
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
            };
          }
        }

        const matchedPlain = sData.find((item) => item.plainLyrics && item.plainLyrics.trim().length > 0);
        if (matchedPlain?.plainLyrics) {
          return {
            id: matchedPlain.id,
            trackName: matchedPlain.trackName || trackName,
            artistName: matchedPlain.artistName || artistName,
            plainLyrics: matchedPlain.plainLyrics,
            segments: [],
            isSynced: false,
          };
        }
      }
    }
  } catch (error) {
    console.warn('[LyricsService] Search fallback error:', error);
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
    await ensureLyricsDirectory();
    const filePath = `${LYRICS_DIR}${trackId}.json`;
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(lyrics));
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
    const filePath = `${LYRICS_DIR}${trackId}.json`;
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return null;

    const content = await FileSystem.readAsStringAsync(filePath);
    return JSON.parse(content) as LyricsData;
  } catch {
    return null;
  }
};
