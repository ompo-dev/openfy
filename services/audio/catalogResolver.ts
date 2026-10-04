import {
  hasCanonicalTitleMatch,
  hasUnwantedForbiddenWords,
  normalizeString,
  splitCanonicalArtists,
} from '../canonical/canonicalMatcher';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { parseYouTubeCount, rankYouTubeCandidate, type YouTubeCandidate } from './youtubeCandidateRanking';
import { recordDownloadDiagnostic } from '../download/downloadDiagnostics';
import { retryNetworkOperation } from './networkRetry';
import {
  getCatalogMapping,
  setCatalogMapping,
  isCurrentCatalogMapping,
  CATALOG_MATCH_POLICY_VERSION,
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
  author: { name: string; id?: string; is_verified?: boolean; is_verified_artist?: boolean };
  duration: { seconds: number };
  view_count?: { toString(): string };
  is_live?: boolean;
  is_upcoming?: boolean;
  best_thumbnail?: { url: string };
};

type SearchClient = {
  search(query: string, options: { type: 'video' }): Promise<{ videos?: unknown[] }>;
  getBasicInfo(videoId: string): Promise<{
    basic_info: { title?: string; duration?: number };
  }>;
  getChannel?(channelId: string): Promise<{
    metadata?: { external_id?: string };
    header?: {
      subscribers?: { toString(): string };
      content?: { metadata?: { metadata_rows?: { metadata_parts?: { text?: { toString(): string } | null }[] }[] } };
    };
  }>;
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
        lang: 'en',
        generate_session_locally: false,
        retrieve_innertube_config: true,
        retrieve_player: false,
      });
    }).catch((error) => {
      searchClient = null;
      throw error;
    });
  }
  return searchClient;
};

const withTimeout = async <T>(p: Promise<T>, label: string, timeoutMs = 10_000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
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

type CatalogYouTubeSource = {
  videoId: string;
  title: string;
  artists: string[];
  durationMs: number;
};

const sourceInfoCache = createAsyncResourceCache<{ title: string; durationMs: number }>({
  name: 'youtube source metadata', category: 'player', maxEntries: 128,
});
const sourceMatchCache = createAsyncResourceCache<CatalogResolveResult>({
  name: 'youtube source identity', category: 'player', maxEntries: 128,
  ttlFor: (result) => result.status === 'resolved' ? 6 * 60 * 60_000 : 10_000,
});

/** A music catalog can point one short song at a film containing several songs. */
export const resolveCatalogYouTubeVideoId = (
  source: CatalogYouTubeSource
): Promise<CatalogResolveResult> => {
  if (!YT_VIDEO_ID_RE.test(source.videoId)) {
    return Promise.resolve({ status: 'not_found', reason: 'invalid_video_id' });
  }
  if (!source.title || !Number.isFinite(source.durationMs) || source.durationMs <= 0) {
    return Promise.resolve({ status: 'resolved', videoId: source.videoId, confidence: 100 });
  }
  const artists = splitCanonicalArtists(source.artists).map(normalizeString).sort();
  // Two catalog songs may reference the same film; never share their mappings.
  const key = `yt-source-v1:${JSON.stringify([
    source.videoId, normalizeString(source.title), artists, Math.round(source.durationMs / 1000),
  ])}`;
  return sourceMatchCache.getOrLoad(key, async () => {
    const cached = await getCatalogMapping(key);
    if (cached && isCurrentCatalogMapping(cached)) {
      return { status: 'resolved', videoId: cached.videoId, confidence: cached.confidence };
    }
    try {
      const info = await sourceInfoCache.getOrLoad(source.videoId, async () => {
        const client = await withTimeout(getSearchClient(), 'YouTube metadata client', 5_000);
        const response = await withTimeout(client.getBasicInfo(source.videoId), 'YouTube source metadata', 5_000);
        const title = response.basic_info.title?.trim() || '';
        const durationMs = Number(response.basic_info.duration) * 1000;
        if (!title || !Number.isFinite(durationMs) || durationMs <= 0) {
          throw new Error('Missing YouTube source identity');
        }
        return { title, durationMs };
      }, 6 * 60 * 60_000);

      if (hasCanonicalTitleMatch(info.title, source.title) &&
          Math.abs(info.durationMs - source.durationMs) <= 40_000) {
        await setCatalogMapping(key, {
          videoId: source.videoId, confirmedAt: Date.now(), confidence: 100,
          source: 'ytmusic', policyVersion: CATALOG_MATCH_POLICY_VERSION,
        });
        return { status: 'resolved', videoId: source.videoId, confidence: 100 };
      }

      recordDownloadDiagnostic(`yt_${source.videoId}`, 'audio.youtube.catalog_source_mismatch', {
        expectedTitle: source.title, expectedDurationMs: source.durationMs,
        sourceTitle: info.title, sourceDurationMs: info.durationMs,
      });
      // Search only after a proven content mismatch, never after a transport failure.
      return resolveSpotifyTrackVideoId(key, source.title, source.artists, source.durationMs);
    } catch (error) {
      return { status: 'not_found', reason: `source_metadata_unavailable: ${String(error)}` };
    }
  }, 6 * 60 * 60_000);
};

// ---------------------------------------------------------------------------
// Spotify track → videoId
// ---------------------------------------------------------------------------

const SEARCH_LIMIT = 12;
const channelCounts = new Map<string, { expiresAt: number; promise: Promise<number | undefined> }>();

const getSubscriberCount = (client: SearchClient, channelId: string): Promise<number | undefined> => {
  const cached = channelCounts.get(channelId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  if (!client.getChannel || !/^UC[\w-]{22}$/.test(channelId)) return Promise.resolve(undefined);
  const promise = withTimeout(client.getChannel(channelId), 'YouTube channel').then((channel) => {
    if (channel.metadata?.external_id !== channelId) return undefined;
    const header = channel.header;
    const countText = header?.subscribers?.toString() || header?.content?.metadata?.metadata_rows
      ?.flatMap((row) => row.metadata_parts || [])
      .map((part) => part.text?.toString() || '')
      .find((text) => /subscribers|inscritos/i.test(text));
    return parseYouTubeCount(countText);
  }).catch(() => undefined);
  if (channelCounts.size >= 64) channelCounts.delete(channelCounts.keys().next().value!);
  const entry = { expiresAt: Date.now() + 30 * 60_000, promise };
  channelCounts.set(channelId, entry);
  void promise.then((count) => {
    if (count === undefined && channelCounts.get(channelId) === entry) channelCounts.delete(channelId);
  });
  return promise;
};

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
  if (cached && isCurrentCatalogMapping(cached)) {
    return { status: 'resolved', videoId: cached.videoId, confidence: cached.confidence };
  }

  const canonicalArtists = splitCanonicalArtists(artists.join(', '));
  const primaryArtist = canonicalArtists[0] ?? '';

  const queries = Array.from(new Set([
    `${canonicalArtists.slice(0, 2).join(' ')} ${title}`.trim(),
    `${primaryArtist} ${title} Official Audio`.trim(),
    `${canonicalArtists.join(' ')} ${title}`.trim(),
  ]));

  try {
    const client = await retryNetworkOperation(() => withTimeout(getSearchClient(), 'YouTube search client'));
    const candidates = new Map<string, YouTubeCandidate>();
    const canonical = { title, artists: canonicalArtists, durationMs, spotifyId };

    for (const query of queries) {
      recordDownloadDiagnostic(spotifyId, 'audio.youtube.search', { query });

      const searchResult = await retryNetworkOperation(
        () => withTimeout(client.search(query, { type: 'video' }), 'YouTube search'),
        (attempt, error) => recordDownloadDiagnostic(spotifyId, 'audio.youtube.search_retry', {
          query, attempt, error: String(error),
        })
      )
        .catch((error) => {
          recordDownloadDiagnostic(spotifyId, 'audio.youtube.search_failed', { query, error: String(error) });
          return { videos: [] };
        });
      const videos = Array.from(searchResult.videos ?? []).reduce<SearchVideo[]>((acc, v) => {
        if (isSearchVideo(v)) acc.push(v);
        return acc;
      }, []);

      recordDownloadDiagnostic(spotifyId, 'audio.youtube.search_results', {
        query, count: videos.length,
      });

      for (const video of videos.slice(0, SEARCH_LIMIT)) {
        if (!YT_VIDEO_ID_RE.test(video.video_id)) continue;
        const previous = candidates.get(video.video_id);
        candidates.set(video.video_id, {
          videoId: video.video_id,
          title: video.title.toString(),
          artist: video.author.name,
          channelId: video.author.id || previous?.channelId,
          durationMs: video.duration.seconds * 1000,
          viewCount: parseYouTubeCount(video.view_count?.toString()) ?? previous?.viewCount,
          isVerifiedChannel: video.author.is_verified || previous?.isVerifiedChannel,
          isOfficialArtistChannel: video.author.is_verified_artist || previous?.isOfficialArtistChannel,
          isLive: video.is_live,
          isUpcoming: video.is_upcoming,
          imageURL: video.best_thumbnail?.url,
        });
      }
    }

    // Compare all searches before choosing. A matching fan display name must
    // not preempt a later result from an official group/label channel.
    const shortlist = [...candidates.values()].map((candidate) => rankYouTubeCandidate(candidate, canonical))
      .filter((item) => item.eligible)
      .sort((a, b) => b.rank - a.rank);
    const channelIds = [...new Set(shortlist.map((item) => item.candidate.channelId).filter(
      (id): id is string => Boolean(id)
    ))].slice(0, 5);
    for (let index = 0; index < channelIds.length; index += 2) {
      await Promise.all(channelIds.slice(index, index + 2).map(async (channelId) => {
        const count = await getSubscriberCount(client, channelId);
        candidates.forEach((candidate) => {
          if (candidate.channelId === channelId) candidate.subscriberCount = count;
        });
      }));
    }

    const evaluated = [...candidates.values()].map((candidate) => rankYouTubeCandidate(candidate, canonical));
    evaluated.forEach((item) => recordDownloadDiagnostic(spotifyId,
      item.eligible ? 'audio.youtube.candidate.matched' : 'audio.youtube.candidate.rejected', {
        ...item.candidate,
        confidence: item.match.sourceConfidence,
        rank: item.rank,
        reasons: item.match.reasons,
        titleMatch: hasCanonicalTitleMatch(item.candidate.title, title),
        durationDiffMs: item.match.durationDifferenceMs,
      }));
    const best = evaluated.filter((item) => item.eligible && !hasUnwantedForbiddenWords(item.candidate.title, title))
      .sort((a, b) => b.rank - a.rank || a.match.durationDifferenceMs - b.match.durationDifferenceMs)[0];
    if (best) {
      const result: CatalogResolveResult = {
        status: 'resolved', videoId: best.candidate.videoId,
        confidence: best.match.sourceConfidence, imageURL: best.candidate.imageURL,
      };
      await setCatalogMapping(spotifyId, {
        videoId: best.candidate.videoId, confirmedAt: Date.now(),
        confidence: best.match.sourceConfidence, source: 'youtube_search',
        policyVersion: CATALOG_MATCH_POLICY_VERSION,
      });
      recordDownloadDiagnostic(spotifyId, 'audio.youtube.selected', {
        ...best.candidate, confidence: best.match.sourceConfidence, rank: best.rank,
      });
      return result;
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
  channelCounts.clear();
  sourceInfoCache.clear();
  sourceMatchCache.clear();
};
