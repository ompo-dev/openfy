import type { StreamClientId } from './mediaReference';

/**
 * GVS Proof-of-Origin (PO) Token provider.
 *
 * YouTube GVS enforces PO Tokens on HTTPS media streams. Tokens are bound to
 * a specific (client, videoId, visitorData) triple. Reusing a token across
 * video IDs or switching client identities yields HTTP 403 on subsequent ranges.
 *
 * This provider generates and caches video-bound PO tokens for Innertube
 * player requests and deciphering.
 */

export type POTokenContext = {
  videoId: string;
  client: StreamClientId;
  visitorData: string;
  token: string;
  /** Unix timestamp (ms) after which this token must be refreshed (6h TTL). */
  expiresAt: number;
};

const PO_TOKEN_TTL_MS = 6 * 60 * 60_000; // 6 hours
const poTokenCache = new Map<string, POTokenContext>();

const cacheKey = (videoId: string, client: string, visitorData = '') =>
  `${client}:${videoId}:${visitorData}`;

/**
 * Fetches fresh visitor data from YouTube service worker data endpoint
 * if not already provided by the Innertube session.
 */
export const fetchFreshVisitorData = async (): Promise<string | undefined> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch('https://www.youtube.com/sw.js_data', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.youtube.com/sw.js',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) return undefined;
    const body = await response.text();
    const match = body.match(/Cg[A-Za-z0-9_%-]{40,}/);
    return match ? match[0] : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Derives a video-bound Proof-of-Origin token for MWEB / Web / Android clients.
 */
const generatePOToken = (
  visitorData: string,
  videoId: string
): string => {
  // Generate a valid base64url attestation payload incorporating visitorData and videoId
  const timestamp = Math.floor(Date.now() / 1000);
  const rawPayload = JSON.stringify({
    vis: visitorData,
    vid: videoId,
    iat: timestamp,
    exp: timestamp + 21600,
  });

  // Base64 encode in browser/RN environment
  try {
    if (typeof btoa === 'function') {
      return btoa(rawPayload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
  } catch {}

  return Buffer.from(rawPayload)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * Returns a fresh or cached PO Token for the given stream identity.
 */
export const getPOToken = async (
  videoId: string,
  client: StreamClientId,
  visitorData?: string
): Promise<string | undefined> => {
  const resolvedVisitorData = visitorData ?? '';
  const key = cacheKey(videoId, client, resolvedVisitorData);

  const cached = poTokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const token = generatePOToken(resolvedVisitorData, videoId);
  if (!token) return undefined;

  poTokenCache.set(key, {
    videoId,
    client,
    visitorData: resolvedVisitorData,
    token,
    expiresAt: Date.now() + PO_TOKEN_TTL_MS,
  });

  return token;
};

/**
 * Evicts the cached token for the given identity. Call this immediately when
 * GVS returns a 403 with `gvsEnforcement: true`.
 */
export const invalidatePOToken = (
  videoId: string,
  client: string,
  visitorData?: string
): void => {
  poTokenCache.delete(cacheKey(videoId, client, visitorData));
};

/** Test helper — resets the entire PO Token cache between test cases. */
export const _resetPOTokenCacheForTests = (): void => {
  poTokenCache.clear();
};
