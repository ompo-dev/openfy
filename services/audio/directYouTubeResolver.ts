import {
  evaluateCandidateMatch,
  hasUnwantedForbiddenWords,
} from '../canonical/canonicalMatcher';

type DirectYouTubeRequest = {
  title?: string;
  artist?: string;
  durationMs?: number;
  videoId?: string;
};

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

type SearchVideo = {
  video_id: string;
  title: { toString(): string };
  author: { name: string };
  duration: { seconds: number };
  best_thumbnail?: { url: string };
};

type DirectInnertubeClient = {
  getStreamingData(
    videoId: string,
    options: { client: 'IOS'; quality: 'best'; type: 'audio' }
  ): Promise<{ url?: string; mime_type?: string }>;
  getBasicInfo(videoId: string): Promise<{
    basic_info: {
      title?: string;
      author?: string;
      duration?: number;
      thumbnail?: { url: string }[];
    };
  }>;
  search(
    query: string,
    options: { type: 'video' }
  ): Promise<{ videos?: unknown[] }>;
};

const SEARCH_LIMIT = 8;
const REQUEST_TIMEOUT_MS = 8_000;
let innertubeClient: Promise<DirectInnertubeClient> | null = null;

const isSearchVideo = (value: unknown): value is SearchVideo => {
  if (!value || typeof value !== 'object') return false;
  const video = value as Partial<SearchVideo>;
  return (
    typeof video.video_id === 'string' &&
    typeof video.title?.toString === 'function' &&
    typeof video.author?.name === 'string' &&
    typeof video.duration?.seconds === 'number'
  );
};

const getClient = (): Promise<DirectInnertubeClient> => {
  if (!innertubeClient) {
    // Delay Metro's ESM module until native audio is needed. Jest never
    // evaluates this branch in unrelated tests, while direct tests mock it.
    innertubeClient = Promise.resolve().then(() => {
      const { Innertube } = require('youtubei.js') as {
        Innertube: {
          create(options: {
            generate_session_locally: boolean;
            retrieve_innertube_config: boolean;
            retrieve_player: boolean;
          }): Promise<DirectInnertubeClient>;
        };
      };
      return Innertube.create({
        generate_session_locally: true,
        retrieve_innertube_config: false,
        retrieve_player: false,
      });
    });
  }
  return innertubeClient;
};

const formatFromMimeType = (mimeType?: string) =>
  mimeType?.includes('audio/webm') ? 'webm' : 'm4a';

const withTimeout = async <T>(request: Promise<T>, label: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          REQUEST_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const resolveVideoAudio = async (
  videoId: string,
  imageURL?: string
): Promise<DirectYouTubeAudio | null> => {
  try {
    // The iOS InnerTube client returns an already playable AAC stream, so it
    // does not need Node, yt-dlp, a proxy, or a JavaScript player decipherer.
    const client = await withTimeout(getClient(), 'YouTube client initialization');
    const stream = await withTimeout(
      client.getStreamingData(videoId, {
        client: 'IOS',
        quality: 'best',
        type: 'audio',
      }),
      'YouTube audio resolution'
    );
    if (!stream.url || !/^https:\/\//i.test(stream.url)) return null;

    return {
      videoId,
      url: stream.url,
      format: formatFromMimeType(stream.mime_type),
      ...(imageURL ? { imageURL } : {}),
    };
  } catch (error) {
    console.warn(
      `[DirectYouTube] iOS audio stream failed for ${videoId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
};

/** Resolves metadata and audio for an exact pasted YouTube video on-device. */
export const resolveDirectYouTubeTrack = async (
  videoId: string
): Promise<DirectYouTubeTrack | null> => {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  try {
    const client = await withTimeout(getClient(), 'YouTube client initialization');
    const info = await withTimeout(
      client.getBasicInfo(videoId),
      'YouTube video metadata'
    );
    const title = info.basic_info.title?.trim();
    if (!title) return null;

    const imageURL = info.basic_info.thumbnail?.at(-1)?.url;
    const audio = await resolveVideoAudio(videoId, imageURL);
    if (!audio) return null;

    return {
      ...audio,
      title,
      artistName: info.basic_info.author?.trim() || 'YouTube Music',
      durationMs: Math.max(0, info.basic_info.duration || 0) * 1000,
    };
  } catch (error) {
    console.warn(
      `[DirectYouTube] metadata failed for ${videoId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
};

export const resolveDirectYouTubeAudio = async (
  request: DirectYouTubeRequest
): Promise<DirectYouTubeAudio | null> => {
  if (request.videoId) return resolveVideoAudio(request.videoId);
  if (!request.title) return null;

  const primaryArtist = (request.artist || '')
    .split(/\s*(?:,|&)\s*/)[0]
    .trim();
  const queries = primaryArtist
    ? [`${primaryArtist} - ${request.title} Official Audio`, `${primaryArtist} ${request.title}`]
    : [`${request.title} Official Audio`];

  try {
    const client = await withTimeout(getClient(), 'YouTube client initialization');
    for (const query of queries) {
      const search = await withTimeout(
        client.search(query, { type: 'video' }),
        'YouTube search'
      );
      const videos = Array.from(search.videos || []).reduce<SearchVideo[]>(
        (items, value) => {
          if (isSearchVideo(value)) items.push(value);
          return items;
        },
        []
      );
      const candidates = videos
        .slice(0, SEARCH_LIMIT)
        .map((video) => {
          const title = video.title.toString();
          const artist = video.author.name;
          const durationMs = video.duration.seconds * 1000;
          const match = evaluateCandidateMatch(
            {
              title,
              artist,
              durationMs,
              provider: 'youtube',
              url: `https://www.youtube.com/watch?v=${video.video_id}`,
            },
            {
              title: request.title || '',
              artists: primaryArtist ? [primaryArtist] : [],
              durationMs: request.durationMs || 0,
              spotifyId: '',
            }
          );
          return { video, title, artist, durationMs, match };
        })
        .filter(
          ({ title, match }) =>
            match.isVerified && !hasUnwantedForbiddenWords(title, request.title || '')
        )
        .sort(
          (left, right) =>
            right.match.sourceConfidence - left.match.sourceConfidence
        );

      for (const candidate of candidates) {
        const imageURL = candidate.video.best_thumbnail?.url;
        const resolved = await resolveVideoAudio(
          candidate.video.video_id,
          imageURL
        );
        if (resolved) return resolved;
      }
    }
  } catch (error) {
    console.warn(
      `[DirectYouTube] search failed for "${primaryArtist} - ${request.title}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return null;
};

export const resetDirectYouTubeResolverForTests = () => {
  innertubeClient = null;
};
