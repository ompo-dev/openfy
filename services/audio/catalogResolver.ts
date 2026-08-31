import {
  evaluateCandidateMatch,
  hasCanonicalTitleMatch,
  hasUnwantedForbiddenWords,
  splitCanonicalArtists,
} from '../canonical/canonicalMatcher';
import { recordDownloadDiagnostic } from '../download/downloadDiagnostics';
import {
  getCatalogMapping,
  setCatalogMapping,
} from './catalogMappingCache';

/**
 * CatalogResolver — any content source → videoId
 *
 * Responsibility: answer "which YouTube videoId corresponds to this content?"
 * This module runs searches, canonical matching, and YouTube link parsing.
 * It never touches stream URLs, probe bytes, or auth headers.
 *
 * Once a confident match is found, the association is persisted via
 * catalogMappingCache so future playbacks skip the search entirely.
 */

// ---------------------------------------------------------------------------
// YouTube URL / videoId parsing
// ---------------------------------------------------------------------------

const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts a YouTube videoId from a URL or a bare ID string.
 * Returns null if the input is not a recognizable YouTube video reference.
 */
export const parseYouTubeVideoId = (urlOrId: string): string | null => {
  const trimmed = urlOrId.trim();

  // Bare videoId (11 chars, alphanumeric + _ and -)
  if (YT_VIDEO_ID_RE.test(trimmed)) return trimmed;

  // yt_XXXXXXXXXXX internal encoding used by audioResolver
  const ytPrefix = trimmed.match(/^yt_([A-Za-z0-9_-]{11})$/);
  if (ytPrefix) return ytPrefix[1];

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    // youtu.be/XXXXXXXXXXX
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      if (YT_VIDEO_ID_RE.test(id)) return id;
    }

    // youtube.com/watch?v=XXXXXXXXXXX
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v && YT_VIDEO_ID_RE.test(v)) return v;

      // youtube.com/embed/XXXXXXXXXXX, youtube.com/shorts/XXXXXXXXXXX
      const pathId = url.pathname.split('/').find(s => YT_VIDEO_ID_RE.test(s));
      if (pathId) return pathId;
    }
  } catch { /* Not a valid URL — already handled by bare-ID check. */ }

  return null;
};

// ---------------------------------------------------------------------------
// Innertube search client (lazy — shared with youtubeStreamResolver indirectly
// through getClient in directYouTubeResolver; catalogResolver uses its own
// reference for search-only operations)
// ---------------------------------------------------------------------------

type SearchVideo = {
  video_id: string;
  title: { toString(): string };
  author: { name: string };
  duration: { seconds: number };
  best_thumbnail?: { url: string };
};

type SearchClient = {
  search(query: string, options: { type: 'video' }): Promise<{ videos?: unknown[] }>;
};

const isSearchVideo = (v: unknown): v is SearchVideo => {
  if (!v || typeof v !== 'object') return false;
  const x = v as Partial<SearchVideo>;
  return (
    typeof x.video_id === 'string' &&
    typeof x.title?.toString === 'function' &&
    typeof x.author?.name === 'string' &&
    typeof x.duration?.seconds === 'number'
  );
};

let searchClient: Promise<SearchClient> | null = null;

const getSearchClient = (): Promise<SearchClient> => {
  if (!searchClient) {
    searchClient = Promise.resolve().then(() => {
      const { Innertube } = require('youtubei.js') as {
        Innertube: { create(opts: object): Promise<SearchClient> };
      };
      return Innertube.create({
        generate_session_locally: false,
        retrieve_innertube_config: true,
        retrieve_player: false,
      });
    });
  }
  return searchClient;
};

const withTimeout = async <T>(p: Promise<T>, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// ---------------------------------------------------------------------------
// Catalog result types
// ---------------------------------------------------------------------------

export type CatalogResolveResult =
  | { status: 'resolved'; videoId: string; confidence: number; imageURL?: string }
  | { status: 'not_found'; reason: string };

// ---------------------------------------------------------------------------
// Spotify track → videoId
// ---------------------------------------------------------------------------

const SEARCH_LIMIT = 8;

/**
 * Searches YouTube for a Spotify track and returns the best canonical match.
 *
 * If a cached mapping exists for the spotifyId (and confidence >= 90), returns
 * the cached videoId without running any search.
 *
 * On a successful match, persists the association so future calls are instant.
 */
export const resolveSpotifyTrackVideoId = async (
  spotifyId: string,
  title: string,
  artists: string[],
  durationMs: number
): Promise<CatalogResolveResult> => {
  // Fast path: cached mapping
  const cached = await getCatalogMapping(spotifyId);
  if (cached) {
    return { status: 'resolved', videoId: cached.videoId, confidence: cached.confidence };
  }

  const canonicalArtists = splitCanonicalArtists(artists.join(', '));
  const primaryArtist = canonicalArtists[0] ?? '';

  const queries = Array.from(new Set([
    ...(artists.length ? [`${artists.join(', ')} - ${title} Official Audio`] : []),
    ...(primaryArtist ? [`${primaryArtist} - ${title} Official Audio`, `${primaryArtist} ${title}`] : []),
    `${title} Official Audio`,
  ]));

  try {
    const client = await withTimeout(getSearchClient(), 'YouTube search client');

    for (const query of queries) {
      recordDownloadDiagnostic(spotifyId, 'audio.youtube.search', { query });

      const searchResult = await withTimeout(client.search(query, { type: 'video' }), 'YouTube search');
      const videos = Array.from(searchResult.videos ?? []).reduce<SearchVideo[]>((acc, v) => {
        if (isSearchVideo(v)) acc.push(v);
        return acc;
      }, []);

      recordDownloadDiagnostic(spotifyId, 'audio.youtube.search_results', {
        query, count: videos.length,
      });

      const evaluated = videos.slice(0, SEARCH_LIMIT).map(video => {
        const vTitle  = video.title.toString();
        const vArtist = video.author.name;
        const vDurMs  = video.duration.seconds * 1000;
        const match = evaluateCandidateMatch(
          { title: vTitle, artist: vArtist, durationMs: vDurMs, provider: 'youtube', url: `https://www.youtube.com/watch?v=${video.video_id}` },
          { title, artists: canonicalArtists, durationMs, spotifyId }
        );
        return { video, title: vTitle, artist: vArtist, match };
      });

      for (const item of evaluated) {
        if (item.match.isVerified) {
          recordDownloadDiagnostic(spotifyId, 'audio.youtube.candidate.matched', {
            videoId: item.video.video_id, title: item.title, author: item.artist,
            confidence: item.match.sourceConfidence,
          });
        } else {
          recordDownloadDiagnostic(spotifyId, 'audio.youtube.candidate.rejected', {
            videoId: item.video.video_id, title: item.title, author: item.artist,
            reason: item.match.reasons[0] ?? 'rejected',
            titleMatch: hasCanonicalTitleMatch(item.title, title),
            durationDiffMs: item.match.durationDifferenceMs,
          });
        }
      }

      const best = evaluated
        .filter(({ title: t, match }) => match.isVerified && !hasUnwantedForbiddenWords(t, title))
        .sort((a, b) => b.match.sourceConfidence - a.match.sourceConfidence)[0];

      if (best) {
        const result: CatalogResolveResult = {
          status: 'resolved',
          videoId: best.video.video_id,
          confidence: best.match.sourceConfidence,
          imageURL: best.video.best_thumbnail?.url,
        };
        // Persist: once matched, never re-search on 403.
        await setCatalogMapping(spotifyId, {
          videoId: best.video.video_id,
          confirmedAt: Date.now(),
          confidence: best.match.sourceConfidence,
          source: 'youtube_search',
        });
        return result;
      }
    }
  } catch (error) {
    console.warn(`[CatalogResolver] search failed for "${primaryArtist} - ${title}": ${error instanceof Error ? error.message : String(error)}`);
    return { status: 'not_found', reason: `search_error: ${error instanceof Error ? error.message : String(error)}` };
  }

  return { status: 'not_found', reason: 'no_canonical_match' };
};

/** @internal — test helper */
export const _resetCatalogResolverForTests = (): void => {
  searchClient = null;
};
