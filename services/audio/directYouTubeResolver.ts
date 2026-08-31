/**
 * directYouTubeResolver.ts — Thin adapter (backward-compatible public API)
 *
 * This module preserves the public API used by audioResolver, downloadManager,
 * playerService and the player store while delegating all real work to the
 * new separated layers:
 *
 *   Catalog:  catalogResolver.ts  (search + canonical match → videoId)
 *   Cache:    catalogMappingCache.ts (spotifyId → videoId, persisted 30 days)
 *   Stream:   youtubeStreamResolver.ts (videoId → StreamResolveResult)
 *
 * Architecture note: once a spotifyId→videoId mapping is cached, a GVS 403
 * will NEVER trigger a new YouTube search — the videoId is already known;
 * only the stream authorization has failed.
 */

import { recordDownloadDiagnostic } from '../download/downloadDiagnostics';
import {
  resolveYouTubeStream,
  reportStreamRefusal,
  getMediaHeaders,
  _resetYouTubeStreamResolverForTests,
} from './youtubeStreamResolver';
import {
  resolveSpotifyTrackVideoId,
  parseYouTubeVideoId,
  _resetCatalogResolverForTests,
} from './catalogResolver';
import {
  getCatalogMapping,
  _resetCatalogMappingCacheForTests,
} from './catalogMappingCache';

// ---------------------------------------------------------------------------
// Re-exported public types (unchanged for callers)
// ---------------------------------------------------------------------------

export type DirectYouTubeAudio = {
  videoId: string;
  url: string;
  format: string;
  imageURL?: string;
};

export type DirectYouTubeTrack = DirectYouTubeAudio & {
  title: string;
  artistName: string;
  durationMs: number;
};

// ---------------------------------------------------------------------------
// Re-exported header helpers (unchanged API)
// ---------------------------------------------------------------------------

export const getDirectYouTubeMediaHeaders = (
  value: string
): Record<string, string> | undefined => getMediaHeaders(value);

export const getAudioSourceWithHeaders = (
  value: string
): { uri: string; headers?: Record<string, string> } => {
  const headers = getMediaHeaders(value);
  return headers ? { uri: value, headers } : { uri: value };
};

// ---------------------------------------------------------------------------
// reportDirectYouTubeStreamRefusal (unchanged API)
// ---------------------------------------------------------------------------

export const reportDirectYouTubeStreamRefusal = (
  url: string,
  status: number
): Promise<void> => reportStreamRefusal(url, status);

// ---------------------------------------------------------------------------
// resolveDirectYouTubeAudio — main adapter
// ---------------------------------------------------------------------------

type DirectYouTubeRequest = {
  title?: string;
  artist?: string;
  durationMs?: number;
  videoId?: string;
  fresh?: boolean;
  spotifyId?: string;
};

/**
 * Resolves a YouTube audio stream for the given request.
 *
 * Resolution order:
 *   1. Direct videoId provided → StreamResolver (no catalog step)
 *   2. spotifyId in catalogMappingCache → StreamResolver (no search)
 *   3. title + artist → CatalogResolver (search + match) → StreamResolver
 *
 * Returns null only when neither catalog nor stream resolution succeeded.
 * Does NOT re-run search on GVS 403 — the videoId is preserved separately.
 */
export const resolveDirectYouTubeAudio = async (
  request: DirectYouTubeRequest
): Promise<DirectYouTubeAudio | null> => {
  const { fresh = false, spotifyId } = request;

  // ── Path 1: direct videoId ────────────────────────────────────────────────
  if (request.videoId) {
    return resolveStream(request.videoId, undefined, fresh, spotifyId);
  }

  // ── Path 2: spotifyId → cached videoId ───────────────────────────────────
  if (spotifyId && !fresh) {
    const cached = await getCatalogMapping(spotifyId);
    if (cached) {
      if (spotifyId) {
        recordDownloadDiagnostic(spotifyId, 'audio.youtube.catalog_cache_hit', {
          videoId: cached.videoId,
          confidence: cached.confidence,
        });
      }
      return resolveStream(cached.videoId, undefined, false, spotifyId);
    }
  }

  // ── Path 3: title/artist → catalog search ────────────────────────────────
  if (!request.title) return null;

  const artists = request.artist ? [request.artist] : [];
  const catalogResult = await resolveSpotifyTrackVideoId(
    spotifyId ?? `anon:${request.title}:${request.artist ?? ''}`,
    request.title,
    artists,
    request.durationMs ?? 0
  );

  if (catalogResult.status !== 'resolved') return null;

  return resolveStream(
    catalogResult.videoId,
    catalogResult.imageURL,
    fresh,
    spotifyId
  );
};

// ---------------------------------------------------------------------------
// resolveDirectYouTubeTrack — for direct YouTube link paste
// ---------------------------------------------------------------------------

/**
 * Resolves metadata + audio for an exact pasted YouTube video URL or videoId.
 * The videoId is treated as an authoritative source — no search is performed.
 */
export const resolveDirectYouTubeTrack = async (
  videoIdOrUrl: string
): Promise<DirectYouTubeTrack | null> => {
  const videoId = parseYouTubeVideoId(videoIdOrUrl) ?? videoIdOrUrl;
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  try {
    // getBasicInfo from Innertube (lazy-loaded)
    const { Innertube } = require('youtubei.js') as {
      Innertube: {
        create(opts: object): Promise<{
          getBasicInfo(id: string): Promise<{
            basic_info: {
              title?: string; author?: string; duration?: number;
              thumbnail?: { url: string }[];
            };
          }>;
        }>;
      };
    };
    const client = await Innertube.create({
      generate_session_locally: false,
      retrieve_innertube_config: true,
      retrieve_player: true,
    });
    const info = await client.getBasicInfo(videoId);
    const title = info.basic_info.title?.trim();
    if (!title) return null;

    const imageURL = info.basic_info.thumbnail?.at(-1)?.url;
    const audio = await resolveStream(videoId, imageURL, false, undefined);
    if (!audio) return null;

    return {
      ...audio,
      title,
      artistName: info.basic_info.author?.trim() ?? 'YouTube Music',
      durationMs: Math.max(0, info.basic_info.duration ?? 0) * 1000,
    };
  } catch (error) {
    console.warn(
      `[DirectYouTube] metadata failed for ${videoId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
};

// ---------------------------------------------------------------------------
// Internal stream resolution with diagnostic events
// ---------------------------------------------------------------------------

const resolveStream = async (
  videoId: string,
  imageURL: string | undefined,
  fresh: boolean,
  spotifyId: string | undefined
): Promise<DirectYouTubeAudio | null> => {
  const result = await resolveYouTubeStream(videoId, { fresh, spotifyId });

  if (result.status === 'resolved') {
    return {
      videoId,
      url: result.stream.url,
      format: result.stream.format === 'webm' ? 'webm' : 'm4a',
      ...(imageURL ? { imageURL } : {}),
    };
  }

  return null;
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export const resetDirectYouTubeResolverForTests = (): void => {
  _resetYouTubeStreamResolverForTests();
  _resetCatalogResolverForTests();
  _resetCatalogMappingCacheForTests();
};
