import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StreamResolveResult, YouTubeStreamDescriptor } from './mediaReference';
import { recordDownloadDiagnostic } from '../download/downloadDiagnostics';

/**
 * YouTubeStreamResolver — videoId → StreamResolveResult
 *
 * Single responsibility: given a videoId, produce a playable stream descriptor.
 * This module never receives title, artist, spotifyId, or any catalog concern.
 * It does not retry by re-searching YouTube if a stream fails authorization.
 *
 * Architecture context:
 *   CatalogResolver → videoId → YouTubeStreamResolver → StreamResolveResult
 *
 * Key behaviours:
 *   - Two-point GVS probe (bytes 0-1 MiB + 1-2 MiB) before marking a URL usable
 *   - GVS enforcement (probe.second 403) → attestation_required, not null
 *   - inFlight dedup: concurrent callers for the same videoId share one Promise
 *   - Verdict cache: short TTL for attestation_required/unplayable so the caller
 *     does not hammer GVS with the same failing videoId
 *   - Player client health tracking persisted to AsyncStorage
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlayerClient = 'IOS' | 'YTMUSIC_ANDROID' | 'ANDROID_VR' | 'TV';

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

type InnertubeClient = {
  getStreamingData(
    videoId: string,
    options: {
      client: PlayerClient;
      quality: 'best';
      type: 'audio';
      /** Phase 2: PO Token for GVS Proof-of-Origin enforcement. */
      po_token?: string;
    }
  ): Promise<{ url?: string; mime_type?: string }>;
  getBasicInfo(videoId: string): Promise<{
    basic_info: {
      title?: string;
      author?: string;
      duration?: number;
      thumbnail?: { url: string }[];
    };
  }>;
};

type StreamProbeResult =
  | { ok: true;  stage: 'first' | 'second'; status: number; byteLength: number; contentType: string }
  | { ok: false; stage: 'first' | 'second'; reason: 'http_status' | 'invalid_content_type' | 'empty_body' | 'timeout' | 'network_error'; status?: number; contentType?: string; error?: string };

// Verdict cache entry — short-lived negative result so we don't hammer GVS.
type VerdictCacheEntry = {
  result: Exclude<StreamResolveResult, { status: 'resolved' }>;
  expiresAt: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 8_000;
const PROBE_FIRST_BYTES    = 1024 * 1024;
const PROBE_SECOND_OFFSET  = 1024 * 1024;
const PROBE_SECOND_BYTES   = 1024 * 1024;
const STREAM_CACHE_TTL_MS  = 10 * 60_000;
// Verdict TTLs — how long we avoid re-resolving a known failure
const ATTESTATION_VERDICT_TTL_MS   = 2 * 60_000;   // 2 min: token might arrive
const UNPLAYABLE_VERDICT_TTL_MS    = 10 * 60_000;  // 10 min: unlikely to change
const BLOCKED_VERDICT_TTL_MS       = 60_000;        // 1 min: cooldowns are short

const CLIENT_FAILURE_COOLDOWN_MS   = 30_000;
const CLIENT_MAX_COOLDOWN_MS       = 5 * 60_000;
const CLIENT_HEALTH_STORAGE_KEY    = '@openfy/youtube-stream-client-health-v1';
const CLIENT_HEALTH_MAX_AGE_MS     = 24 * 60 * 60_000;
const CLIENT_HEALTH_MAX_SUCCESSES  = 10_000;
const CLIENT_HEALTH_MAX_FAILURES   = 20;
const CLIENT_HEALTH_MAX_LATENCY_MS = 60_000;

const PLAYER_CLIENTS: readonly PlayerClient[] = ['IOS', 'YTMUSIC_ANDROID', 'ANDROID_VR', 'TV'];

const IOS_USER_AGENT =
  'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)';
const ANDROID_USER_AGENT =
  'com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip';
const ANDROID_VR_USER_AGENT =
  'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
const TV_USER_AGENT = 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let innertubeClient: Promise<InnertubeClient> | null = null;
// Resolved stream descriptors — keyed by videoId
const streamCache = new Map<string, { value: YouTubeStreamDescriptor; expiresAt: number }>();
// In-flight promises — prevents duplicate parallel resolutions for the same videoId
const inFlight = new Map<string, Promise<StreamResolveResult>>();
// Short-lived verdict cache for non-resolved outcomes
const verdictCache = new Map<string, VerdictCacheEntry>();
// Map url → client that minted it (for header lookup)
const urlToClient = new Map<string, PlayerClient>();
const playerClientHealth = new Map<PlayerClient, PlayerClientHealth>();
let healthHydration: Promise<void> | null = null;
let healthWrite: Promise<void> = Promise.resolve();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const errorMsg = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object';

const isPlayerClient = (v: string): v is PlayerClient =>
  PLAYER_CLIENTS.includes(v as PlayerClient);

const isNonNegativeFinite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

const isValidHealth = (v: unknown): v is PlayerClientHealth => {
  if (!isRecord(v)) return false;
  const { successes, consecutiveFailures, averageLatencyMs, cooldownUntil } = v;
  return (
    isNonNegativeFinite(successes) &&
    isNonNegativeFinite(consecutiveFailures) &&
    isNonNegativeFinite(averageLatencyMs) &&
    isNonNegativeFinite(cooldownUntil) &&
    Number.isInteger(successes as number) &&
    Number.isInteger(consecutiveFailures as number) &&
    (successes as number) <= CLIENT_HEALTH_MAX_SUCCESSES &&
    (consecutiveFailures as number) <= CLIENT_HEALTH_MAX_FAILURES &&
    (averageLatencyMs as number) <= CLIENT_HEALTH_MAX_LATENCY_MS &&
    (cooldownUntil as number) <= Date.now() + CLIENT_MAX_COOLDOWN_MS
  );
};

const healthFor = (client: PlayerClient): PlayerClientHealth =>
  playerClientHealth.get(client) ?? {
    successes: 0, consecutiveFailures: 0, averageLatencyMs: 0, cooldownUntil: 0,
  };

const persistHealth = (): Promise<void> => {
  const payload: PersistedPlayerClientHealth = {
    savedAt: Date.now(),
    clients: Object.fromEntries(playerClientHealth),
  };
  const serialized = JSON.stringify(payload);
  healthWrite = healthWrite.catch(() => undefined).then(async () => {
    try { await AsyncStorage.setItem(CLIENT_HEALTH_STORAGE_KEY, serialized); } catch { /* non-fatal */ }
  });
  return healthWrite;
};

const hydrateHealth = (): Promise<void> => {
  if (!healthHydration) {
    healthHydration = (async () => {
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
        ) return;
        for (const [client, health] of Object.entries(value.clients)) {
          if (isPlayerClient(client) && isValidHealth(health)) {
            playerClientHealth.set(client, { ...health });
          }
        }
      } catch { /* Ignore malformed or unavailable storage. */ }
    })();
  }
  return healthHydration;
};

const orderedClients = (): PlayerClient[] => {
  const now = Date.now();
  const available = PLAYER_CLIENTS.filter(c => healthFor(c).cooldownUntil <= now);
  const candidates = available.length > 0 ? available : [...PLAYER_CLIENTS];
  return [...candidates].sort((a, b) => {
    const ha = healthFor(a), hb = healthFor(b);
    const sa = ha.successes * 2 - ha.consecutiveFailures * 3;
    const sb = hb.successes * 2 - hb.consecutiveFailures * 3;
    if (sb !== sa) return sb - sa;
    if (ha.averageLatencyMs !== hb.averageLatencyMs) return ha.averageLatencyMs - hb.averageLatencyMs;
    return PLAYER_CLIENTS.indexOf(a) - PLAYER_CLIENTS.indexOf(b);
  });
};

const recordSuccess = async (client: PlayerClient, latencyMs: number) => {
  const prev = healthFor(client);
  const successes = prev.successes + 1;
  playerClientHealth.set(client, {
    successes,
    consecutiveFailures: 0,
    averageLatencyMs: (prev.averageLatencyMs * prev.successes + latencyMs) / successes,
    cooldownUntil: 0,
  });
  await persistHealth();
};

const recordFailure = async (client: PlayerClient) => {
  const prev = healthFor(client);
  const f = prev.consecutiveFailures + 1;
  playerClientHealth.set(client, {
    ...prev,
    consecutiveFailures: f,
    cooldownUntil: Date.now() + Math.min(CLIENT_FAILURE_COOLDOWN_MS * 2 ** (f - 1), CLIENT_MAX_COOLDOWN_MS),
  });
  await persistHealth();
};

// ---------------------------------------------------------------------------
// Media headers (exported — used by playerService and audioResolver)
// ---------------------------------------------------------------------------

const clientFromUrl = (url: string): PlayerClient => {
  try {
    const params = new URL(url).searchParams;
    switch (params.get('c')?.toUpperCase()) {
      case 'ANDROID_VR': return 'ANDROID_VR';
      case 'ANDROID': case 'ANDROID_MUSIC': return 'YTMUSIC_ANDROID';
      case 'TVHTML5': return 'TV';
      default: return 'IOS';
    }
  } catch { return 'IOS'; }
};

/** Returns the HTTP headers required to fetch bytes from a GVS URL. */
export const getMediaHeaders = (url: string): Record<string, string> | undefined => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'googlevideo.com' && !parsed.hostname.endsWith('.googlevideo.com')) {
      return undefined;
    }
    const client = urlToClient.get(url) ?? clientFromUrl(url);
    switch (client) {
      case 'ANDROID_VR':    return { 'User-Agent': ANDROID_VR_USER_AGENT };
      case 'YTMUSIC_ANDROID': return { 'User-Agent': ANDROID_USER_AGENT };
      case 'TV':            return { 'User-Agent': TV_USER_AGENT, Origin: 'https://www.youtube.com', Referer: 'https://www.youtube.com/' };
      default:              return { 'User-Agent': IOS_USER_AGENT };
    }
  } catch { return undefined; }
};

// ---------------------------------------------------------------------------
// Innertube client
// ---------------------------------------------------------------------------

const getClient = (): Promise<InnertubeClient> => {
  if (!innertubeClient) {
    innertubeClient = Promise.resolve().then(() => {
      const { Innertube } = require('youtubei.js') as {
        Innertube: {
          create(opts: {
            generate_session_locally: boolean;
            retrieve_innertube_config: boolean;
            retrieve_player: boolean;
          }): Promise<InnertubeClient>;
        };
      };
      return Innertube.create({
        generate_session_locally: false,
        retrieve_innertube_config: true,
        retrieve_player: true,
      });
    });
  }
  return innertubeClient;
};

const withTimeout = async <T>(p: Promise<T>, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// ---------------------------------------------------------------------------
// Two-point probe
// ---------------------------------------------------------------------------

const isPlayableAudio = (r: Response) => {
  if (!r.ok && r.status !== 206) return false;
  const ct = r.headers.get('content-type') ?? '';
  return ct.startsWith('audio/') || ct.startsWith('video/mp4');
};

const fetchRange = async (
  url: string,
  start: number,
  end: number,
  stage: 'first' | 'second'
): Promise<StreamProbeResult> => {
  try {
    const headers = { ...getMediaHeaders(url), Range: `bytes=${start}-${end}` };
    const response = await withTimeout(fetch(url, { headers }), `GVS probe (${stage})`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok && response.status !== 206)
      return { ok: false, stage, reason: 'http_status', status: response.status, contentType };
    if (!isPlayableAudio(response))
      return { ok: false, stage, reason: 'invalid_content_type', status: response.status, contentType };
    const buf = await response.arrayBuffer();
    if (buf.byteLength === 0)
      return { ok: false, stage, reason: 'empty_body', status: response.status, contentType };
    return { ok: true, stage, status: response.status, byteLength: buf.byteLength, contentType };
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.toLowerCase().includes('timed out');
    return { ok: false, stage, reason: isTimeout ? 'timeout' : 'network_error', error: errorMsg(err) };
  }
};

/**
 * Two-point GVS probe.
 * First  (0–1 MiB): catches missing URL / total auth failures.
 * Second (1–2 MiB): catches GVS PO Token enforcement on subsequent ranges.
 * A 403 on second while first passes is the GVS enforcement fingerprint.
 */
const probeStream = async (url: string): Promise<StreamProbeResult> => {
  const first = await fetchRange(url, 0, PROBE_FIRST_BYTES - 1, 'first');
  if (!first.ok) return first;
  return fetchRange(url, PROBE_SECOND_OFFSET, PROBE_SECOND_OFFSET + PROBE_SECOND_BYTES - 1, 'second');
};

// ---------------------------------------------------------------------------
// Core resolution logic
// ---------------------------------------------------------------------------

const formatFromMime = (mime?: string): 'mp4' | 'webm' =>
  mime?.includes('audio/webm') ? 'webm' : 'mp4';

const doResolve = async (
  videoId: string,
  fresh: boolean,
  spotifyId?: string
): Promise<StreamResolveResult> => {
  // Check verdict cache first (negative outcomes with TTL)
  if (!fresh) {
    const verdict = verdictCache.get(videoId);
    if (verdict && verdict.expiresAt > Date.now()) {
      return verdict.result;
    }
  }

  // Check stream cache
  if (!fresh) {
    const cached = streamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return { status: 'resolved', stream: cached.value };
    }
  }

  try {
    const [client] = await Promise.all([
      withTimeout(getClient(), 'Innertube client init'),
      hydrateHealth(),
    ]);

    const clients = orderedClients();

    // All clients in cooldown → temporarily_blocked
    if (clients.length === 0) {
      const earliest = Math.min(...PLAYER_CLIENTS.map(c => healthFor(c).cooldownUntil));
      const result: StreamResolveResult = { status: 'temporarily_blocked', videoId, retryAt: earliest };
      verdictCache.set(videoId, { result, expiresAt: Date.now() + BLOCKED_VERDICT_TTL_MS });
      return result;
    }

    for (const playerClient of clients) {
      const startedAt = Date.now();
      if (spotifyId) {
        recordDownloadDiagnostic(spotifyId, 'audio.youtube.stream.client_attempt', {
          videoId,
          client: playerClient,
        });
      }

      let streamError: string | undefined;
      const stream = await withTimeout(
        client.getStreamingData(videoId, { client: playerClient, quality: 'best', type: 'audio' }),
        `${playerClient} stream resolution`
      ).catch((err: unknown) => { streamError = errorMsg(err); return null; });

      if (!stream?.url || !/^https:\/\//i.test(stream.url)) {
        if (spotifyId) {
          recordDownloadDiagnostic(spotifyId, 'audio.youtube.stream.client_failed', {
            videoId,
            client: playerClient,
            stage: 'streaming_data',
            reason: 'missing_stream_url',
            error: streamError,
          });
        }
        await recordFailure(playerClient);
        console.warn(`[StreamResolver] ${playerClient} no URL for ${videoId}: ${streamError ?? 'empty'}`);
        continue;
      }

      const probe = await probeStream(stream.url);
      const isGvsEnforcement = !probe.ok && probe.stage === 'second' && probe.status === 403;

      if (!probe.ok) {
        if (spotifyId) {
          recordDownloadDiagnostic(spotifyId, 'audio.youtube.stream.client_failed', {
            videoId,
            client: playerClient,
            stage: `probe.${probe.stage}`,
            reason: probe.reason,
            status: probe.status,
            contentType: probe.contentType,
            error: probe.error,
            gvsEnforcement: isGvsEnforcement,
          });
        }
        await recordFailure(playerClient);
        if (isGvsEnforcement) {
          // The signed URL is valid but GVS requires a PO Token. No point trying
          // other transports with the same credential — break and report.
          innertubeClient = null;  // Force fresh session on next call
          const result: StreamResolveResult = { status: 'attestation_required', videoId, client: playerClient };
          verdictCache.set(videoId, { result, expiresAt: Date.now() + ATTESTATION_VERDICT_TTL_MS });
          console.warn(`[StreamResolver] GVS attestation required for ${videoId} (${playerClient})`);
          return result;
        }
        console.warn(`[StreamResolver] ${playerClient} probe.${probe.stage} failed (${probe.reason} ${probe.status ?? ''}) for ${videoId}`);
        continue;
      }

      // Success path
      const descriptor: YouTubeStreamDescriptor = {
        videoId,
        url: stream.url,
        headers: getMediaHeaders(stream.url) ?? {},
        format: formatFromMime(stream.mime_type),
        client: playerClient,
        expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
        sessionKey: `${playerClient}:session`,
      };
      streamCache.set(videoId, { value: descriptor, expiresAt: descriptor.expiresAt });
      urlToClient.set(stream.url, playerClient);
      verdictCache.delete(videoId);  // Clear any prior negative verdict
      await recordSuccess(playerClient, Date.now() - startedAt);
      if (spotifyId) {
        recordDownloadDiagnostic(spotifyId, 'audio.youtube.stream.client_probe_passed', {
          videoId,
          client: playerClient,
          format: descriptor.format,
        });
      }
      console.log(`[StreamResolver] ${playerClient} probe passed for ${videoId}`);
      return { status: 'resolved', stream: descriptor };
    }
  } catch (error) {
    const msg = errorMsg(error);
    console.warn(`[StreamResolver] transport error for ${videoId}: ${msg}`);
    const result: StreamResolveResult = { status: 'transport_error', videoId, error: msg };
    verdictCache.set(videoId, { result, expiresAt: Date.now() + BLOCKED_VERDICT_TTL_MS });
    return result;
  }

  // All clients failed without GVS enforcement
  const result: StreamResolveResult = {
    status: 'unplayable',
    videoId,
    reason: 'all_clients_failed',
  };
  verdictCache.set(videoId, { result, expiresAt: Date.now() + UNPLAYABLE_VERDICT_TTL_MS });
  return result;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a YouTube videoId to a playable StreamDescriptor.
 *
 * Returns a typed StreamResolveResult — never null. Callers pattern-match
 * on `.status` to decide how to handle each outcome.
 *
 * Concurrent calls for the same videoId share one in-flight Promise.
 * `fresh: true` bypasses both stream cache and in-flight dedup.
 */
export const resolveYouTubeStream = async (
  videoId: string,
  options?: { fresh?: boolean; spotifyId?: string }
): Promise<StreamResolveResult> => {
  const fresh = options?.fresh ?? false;
  const spotifyId = options?.spotifyId;

  if (fresh) return doResolve(videoId, true, spotifyId);

  const pending = inFlight.get(videoId);
  if (pending) return pending;

  const promise = doResolve(videoId, false, spotifyId).finally(() => {
    inFlight.delete(videoId);
  });
  inFlight.set(videoId, promise);
  return promise;
};

/**
 * Called by the player/downloader when GVS refuses a real transfer.
 * Evicts the stream cache, records a client failure, and invalidates the
 * Innertube session so the next resolve gets a fresh visitor identity.
 */
export const reportStreamRefusal = async (url: string, status: number): Promise<void> => {
  if (![403, 404, 410].includes(status)) return;
  const client = urlToClient.get(url);
  if (!client) return;

  urlToClient.delete(url);
  for (const [vid, cached] of streamCache) {
    if (cached.value.url === url) {
      streamCache.delete(vid);
      verdictCache.delete(vid);
    }
  }
  innertubeClient = null;
  await recordFailure(client);
  console.warn(`[StreamResolver] ${client} stream refused with HTTP ${status}; session reset.`);
};

/** @internal — test helper */
export const _resetYouTubeStreamResolverForTests = (): void => {
  innertubeClient = null;
  streamCache.clear();
  inFlight.clear();
  verdictCache.clear();
  urlToClient.clear();
  playerClientHealth.clear();
  healthHydration = null;
  healthWrite = Promise.resolve();
};
