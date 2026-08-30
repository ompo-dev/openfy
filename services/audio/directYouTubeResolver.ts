import {
  evaluateCandidateMatch,
  hasCanonicalTitleMatch,
  hasUnwantedForbiddenWords,
  splitCanonicalArtists,
} from '../canonical/canonicalMatcher';
import { recordDownloadDiagnostic } from '../download/downloadDiagnostics';
import AsyncStorage from '@react-native-async-storage/async-storage';

type DirectYouTubeRequest = {
  title?: string;
  artist?: string;
  durationMs?: number;
  videoId?: string;
  fresh?: boolean;
  spotifyId?: string;
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

type DirectPlayerClient = 'IOS' | 'YTMUSIC_ANDROID' | 'ANDROID_VR' | 'TV';

type PlayerClientHealth = {
  successes: number;
  consecutiveFailures: number;
  averageLatencyMs: number;
  cooldownUntil: number;
};

type PersistedPlayerClientHealth = {
  savedAt: number;
  clients: Record<string, PlayerClientHealth>;
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
    options: { client: DirectPlayerClient; quality: 'best'; type: 'audio' }
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
// Must match the real fallback chunk. Tiny probes can pass while downloads 403.
const STREAM_PROBE_BYTES = 1024 * 1024;
const STREAM_CACHE_TTL_MS = 10 * 60_000;
const CLIENT_FAILURE_COOLDOWN_MS = 30_000;
const CLIENT_MAX_COOLDOWN_MS = 5 * 60_000;
const CLIENT_HEALTH_STORAGE_KEY = '@openfy/youtube-player-client-health-v1';
const CLIENT_HEALTH_MAX_AGE_MS = 24 * 60 * 60_000;
const CLIENT_HEALTH_MAX_SUCCESSES = 10_000;
const CLIENT_HEALTH_MAX_FAILURES = 20;
const CLIENT_HEALTH_MAX_LATENCY_MS = 60_000;
const PLAYER_CLIENTS: readonly DirectPlayerClient[] = [
  'IOS',
  'YTMUSIC_ANDROID',
  'ANDROID_VR',
  'TV',
];
const IOS_MEDIA_USER_AGENT =
  'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)';
const ANDROID_MEDIA_USER_AGENT =
  'com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip';
const ANDROID_VR_MEDIA_USER_AGENT =
  'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
const TV_MEDIA_USER_AGENT = 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version';
let innertubeClient: Promise<DirectInnertubeClient> | null = null;
const streamCache = new Map<
  string,
  { value: DirectYouTubeAudio; expiresAt: number }
>();
const pendingStreams = new Map<string, Promise<DirectYouTubeAudio | null>>();
const streamClientByUrl = new Map<string, DirectPlayerClient>();
const playerClientHealth = new Map<DirectPlayerClient, PlayerClientHealth>();
let playerClientHealthHydration: Promise<void> | null = null;
let playerClientHealthWrite: Promise<void> = Promise.resolve();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

const isPlayerClient = (value: string): value is DirectPlayerClient =>
  PLAYER_CLIENTS.includes(value as DirectPlayerClient);

const playerClientFromStreamUrl = (
  clientName: string | null
): DirectPlayerClient => {
  switch (clientName?.toUpperCase()) {
    case 'ANDROID_VR':
      return 'ANDROID_VR';
    case 'ANDROID':
    case 'ANDROID_MUSIC':
      return 'YTMUSIC_ANDROID';
    case 'TVHTML5':
      return 'TV';
    default:
      return 'IOS';
  }
};

/** googlevideo checks that media fetch uses identity which minted its URL. */
export const getDirectYouTubeMediaHeaders = (
  value: string
): Record<string, string> | undefined => {
  try {
    const url = new URL(value);
    if (url.hostname !== 'googlevideo.com' && !url.hostname.endsWith('.googlevideo.com')) {
      return undefined;
    }
    // Prefer the actual client that received this URL from the player API.
    // `c` is a useful fallback, but Google does not guarantee it matches the
    // request identity for every returned stream.
    switch (
      streamClientByUrl.get(value) ??
      playerClientFromStreamUrl(url.searchParams.get('c'))
    ) {
      case 'ANDROID_VR':
        return { 'User-Agent': ANDROID_VR_MEDIA_USER_AGENT };
      case 'YTMUSIC_ANDROID':
        return { 'User-Agent': ANDROID_MEDIA_USER_AGENT };
      case 'TV':
        return {
          'User-Agent': TV_MEDIA_USER_AGENT,
          Origin: 'https://www.youtube.com',
          Referer: 'https://www.youtube.com/',
        };
      default:
        return { 'User-Agent': IOS_MEDIA_USER_AGENT };
    }
  } catch {
    return undefined;
  }
};

/** Get AudioSource object with headers for expo-audio. */
export const getAudioSourceWithHeaders = (
  value: string
): { uri: string; headers?: Record<string, string> } => {
  const headers = getDirectYouTubeMediaHeaders(value);
  return headers ? { uri: value, headers } : { uri: value };
};


const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isValidPlayerClientHealth = (
  value: unknown
): value is PlayerClientHealth => {
  if (!isRecord(value)) return false;
  const {
    successes,
    consecutiveFailures,
    averageLatencyMs,
    cooldownUntil,
  } = value;
  if (
    !isNonNegativeFiniteNumber(successes) ||
    !isNonNegativeFiniteNumber(consecutiveFailures) ||
    !isNonNegativeFiniteNumber(averageLatencyMs) ||
    !isNonNegativeFiniteNumber(cooldownUntil)
  ) {
    return false;
  }
  return (
    Number.isInteger(successes) &&
    Number.isInteger(consecutiveFailures) &&
    successes <= CLIENT_HEALTH_MAX_SUCCESSES &&
    consecutiveFailures <= CLIENT_HEALTH_MAX_FAILURES &&
    averageLatencyMs <= CLIENT_HEALTH_MAX_LATENCY_MS &&
    cooldownUntil <= Date.now() + CLIENT_MAX_COOLDOWN_MS
  );
};

const persistPlayerClientHealth = (): Promise<void> => {
  const value: PersistedPlayerClientHealth = {
    savedAt: Date.now(),
    clients: Object.fromEntries(playerClientHealth),
  };
  const serialized = JSON.stringify(value);
  playerClientHealthWrite = playerClientHealthWrite
    .catch(() => undefined)
    .then(async () => {
      try {
        await AsyncStorage.setItem(CLIENT_HEALTH_STORAGE_KEY, serialized);
      } catch {
        // Local resolution must continue if the device storage is unavailable.
      }
    });
  return playerClientHealthWrite;
};

const hydratePlayerClientHealth = (): Promise<void> => {
  if (!playerClientHealthHydration) {
    playerClientHealthHydration = (async () => {
      try {
        const serialized = await AsyncStorage.getItem(CLIENT_HEALTH_STORAGE_KEY);
        if (!serialized) return;
        const value: unknown = JSON.parse(serialized);
        if (
          !isRecord(value) ||
          typeof value.savedAt !== 'number' ||
          !Number.isFinite(value.savedAt) ||
          Date.now() - value.savedAt > CLIENT_HEALTH_MAX_AGE_MS ||
          !isRecord(value.clients)
        ) {
          return;
        }
        for (const [playerClient, health] of Object.entries(value.clients)) {
          if (isPlayerClient(playerClient) && isValidPlayerClientHealth(health)) {
            playerClientHealth.set(playerClient, { ...health });
          }
        }
      } catch {
        // Ignore malformed or unavailable device storage.
      }
    })();
  }
  return playerClientHealthHydration;
};

const healthFor = (playerClient: DirectPlayerClient): PlayerClientHealth =>
  playerClientHealth.get(playerClient) || {
    successes: 0,
    consecutiveFailures: 0,
    averageLatencyMs: 0,
    cooldownUntil: 0,
  };

const orderedPlayerClients = (): DirectPlayerClient[] => {
  const now = Date.now();
  const available = PLAYER_CLIENTS.filter(
    (playerClient) => healthFor(playerClient).cooldownUntil <= now
  );
  const candidates = available.length > 0 ? available : [...PLAYER_CLIENTS];

  return [...candidates].sort((left, right) => {
    const leftHealth = healthFor(left);
    const rightHealth = healthFor(right);
    const leftScore = leftHealth.successes * 2 - leftHealth.consecutiveFailures * 3;
    const rightScore =
      rightHealth.successes * 2 - rightHealth.consecutiveFailures * 3;
    if (rightScore !== leftScore) return rightScore - leftScore;
    if (leftHealth.averageLatencyMs !== rightHealth.averageLatencyMs) {
      return leftHealth.averageLatencyMs - rightHealth.averageLatencyMs;
    }
    return PLAYER_CLIENTS.indexOf(left) - PLAYER_CLIENTS.indexOf(right);
  });
};

const recordPlayerClientSuccess = async (
  playerClient: DirectPlayerClient,
  latencyMs: number
) => {
  const previous = healthFor(playerClient);
  const successes = previous.successes + 1;
  playerClientHealth.set(playerClient, {
    successes,
    consecutiveFailures: 0,
    averageLatencyMs:
      (previous.averageLatencyMs * previous.successes + latencyMs) / successes,
    cooldownUntil: 0,
  });
  await persistPlayerClientHealth();
};

const recordPlayerClientFailure = async (playerClient: DirectPlayerClient) => {
  const previous = healthFor(playerClient);
  const consecutiveFailures = previous.consecutiveFailures + 1;
  const cooldownMs = Math.min(
    CLIENT_FAILURE_COOLDOWN_MS * 2 ** (consecutiveFailures - 1),
    CLIENT_MAX_COOLDOWN_MS
  );
  playerClientHealth.set(playerClient, {
    ...previous,
    consecutiveFailures,
    cooldownUntil: Date.now() + cooldownMs,
  });
  await persistPlayerClientHealth();
};

/** Learns from the real transfer, not only the small resolver probe. */
export const reportDirectYouTubeStreamRefusal = async (
  url: string,
  status: number
) => {
  if (![403, 404, 410].includes(status)) return;
  const playerClient = streamClientByUrl.get(url);
  if (!playerClient) return;

  streamClientByUrl.delete(url);
  for (const [videoId, cached] of streamCache) {
    if (cached.value.url === url) streamCache.delete(videoId);
  }
  // A googlevideo refusal is tied to the session which minted the URL. Do not
  // reuse that session when the caller asks the resolver for a fresh stream.
  innertubeClient = null;
  await recordPlayerClientFailure(playerClient);
  console.warn(
    `[DirectYouTube] ${playerClient} stream refused with HTTP ${status}; client cooled down.`
  );
};

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
        // Fetch YouTube's current visitor/session data instead of inventing a
        // local visitor id. Locally generated ids often pass the first byte
        // probe, then Google rejects later media ranges with HTTP 403.
        generate_session_locally: false,
        retrieve_innertube_config: true,
        retrieve_player: true,
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

const isPlayableAudioResponse = (response: Response) => {
  if (!response.ok && response.status !== 206) return false;
  const mimeType = response.headers.get('content-type') || '';
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/mp4');
};

const probeStream = async (url: string): Promise<boolean> => {
  try {
    const headers = {
      ...getDirectYouTubeMediaHeaders(url),
      Range: `bytes=0-${STREAM_PROBE_BYTES - 1}`,
    };
    const response = await withTimeout(
      fetch(url, { headers }),
      'YouTube audio probe'
    );
    if (!isPlayableAudioResponse(response)) return false;
    return (await response.arrayBuffer()).byteLength > 0;
  } catch {
    return false;
  }
};

const resolveVideoAudio = async (
  videoId: string,
  imageURL?: string,
  fresh = false,
  spotifyId?: string
): Promise<DirectYouTubeAudio | null> => {
  const cached = streamCache.get(videoId);
  if (!fresh && cached && cached.expiresAt > Date.now()) {
    return imageURL && !cached.value.imageURL
      ? { ...cached.value, imageURL }
      : cached.value;
  }

  const active = fresh ? null : pendingStreams.get(videoId);
  if (active) return active;

  const request = (async (): Promise<DirectYouTubeAudio | null> => {
    try {
      const [client] = await Promise.all([
        withTimeout(getClient(), 'YouTube client initialization'),
        hydratePlayerClientHealth(),
      ]);
      for (const playerClient of orderedPlayerClients()) {
        const startedAt = Date.now();
        if (spotifyId) {
          recordDownloadDiagnostic(spotifyId, 'audio.youtube.stream.client_attempt', {
            videoId,
            client: playerClient,
          });
        }
        const stream = await withTimeout(
          client.getStreamingData(videoId, {
            client: playerClient,
            quality: 'best',
            type: 'audio',
          }),
          `YouTube ${playerClient} audio resolution`
        ).catch(() => null);
        if (!stream?.url || !/^https:\/\//i.test(stream.url)) {
          if (spotifyId) {
            recordDownloadDiagnostic(spotifyId, 'audio.youtube.stream.client_failed', {
              videoId,
              client: playerClient,
              reason: 'missing_stream_url',
            });
          }
          await recordPlayerClientFailure(playerClient);
          continue;
        }
        if (!(await probeStream(stream.url))) {
          if (spotifyId) {
            recordDownloadDiagnostic(spotifyId, 'audio.youtube.stream.client_failed', {
              videoId,
              client: playerClient,
              reason: 'probe_failed',
            });
          }
          await recordPlayerClientFailure(playerClient);
          continue;
        }

        const resolved = {
          videoId,
          url: stream.url,
          format: formatFromMimeType(stream.mime_type),
          ...(imageURL ? { imageURL } : {}),
        };
        streamCache.set(videoId, {
          value: resolved,
          expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
        });
        streamClientByUrl.set(resolved.url, playerClient);
        await recordPlayerClientSuccess(playerClient, Date.now() - startedAt);
        if (spotifyId) {
          recordDownloadDiagnostic(spotifyId, 'audio.youtube.stream.client_verified', {
            videoId,
            client: playerClient,
            format: resolved.format,
          });
        }
        console.log(`[DirectYouTube] ${playerClient} stream verified for ${videoId}`);
        return resolved;
      }
    } catch (error) {
      console.warn(
        `[DirectYouTube] local stream failed for ${videoId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return null;
  })().finally(() => {
    if (!fresh) pendingStreams.delete(videoId);
  });

  if (!fresh) pendingStreams.set(videoId, request);
  return request;
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
  if (request.videoId) {
    return resolveVideoAudio(
      request.videoId,
      undefined,
      request.fresh,
      request.spotifyId
    );
  }
  if (!request.title) return null;

  const canonicalArtists = splitCanonicalArtists(request.artist || '');
  const primaryArtist = canonicalArtists[0] || '';
  const queries = Array.from(
    new Set([
      ...(request.artist ? [`${request.artist} - ${request.title} Official Audio`] : []),
      ...(primaryArtist
        ? [`${primaryArtist} - ${request.title} Official Audio`, `${primaryArtist} ${request.title}`]
        : []),
      `${request.title} Official Audio`,
    ])
  );

  try {
    const client = await withTimeout(getClient(), 'YouTube client initialization');
    for (const query of queries) {
      if (request.spotifyId) {
        recordDownloadDiagnostic(request.spotifyId, 'audio.youtube.search', {
          query,
        });
      }
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

      if (request.spotifyId) {
        recordDownloadDiagnostic(request.spotifyId, 'audio.youtube.search_results', {
          query,
          count: videos.length,
        });
      }

      const evaluated = videos.slice(0, SEARCH_LIMIT).map((video) => {
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
            artists: canonicalArtists,
            durationMs: request.durationMs || 0,
            spotifyId: request.spotifyId || '',
          }
        );
        return { video, title, artist, durationMs, match };
      });

      for (const item of evaluated) {
        if (!item.match.isVerified) {
          if (request.spotifyId) {
            recordDownloadDiagnostic(
              request.spotifyId,
              'audio.youtube.candidate.rejected',
              {
                videoId: item.video.video_id,
                title: item.title,
                author: item.artist,
                reason: item.match.reasons[0] || 'rejected',
                titleMatch: hasCanonicalTitleMatch(item.title, request.title || ''),
                durationDiffMs: item.match.durationDifferenceMs,
              }
            );
          }
        } else {
          if (request.spotifyId) {
            recordDownloadDiagnostic(
              request.spotifyId,
              'audio.youtube.candidate.matched',
              {
                videoId: item.video.video_id,
                title: item.title,
                author: item.artist,
                confidence: item.match.sourceConfidence,
              }
            );
          }
        }
      }

      const candidates = evaluated
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
          imageURL,
          request.fresh,
          request.spotifyId
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
  streamCache.clear();
  pendingStreams.clear();
  streamClientByUrl.clear();
  playerClientHealth.clear();
  playerClientHealthHydration = null;
  playerClientHealthWrite = Promise.resolve();
};
