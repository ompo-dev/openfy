/**
 * GVS Proof-of-Origin (PO) Token provider contract.
 *
 * YouTube's GVS enforces PO Tokens on HTTPS streams since mid-2026. Tokens are
 * bound to a specific (client, videoId, visitorData) triple; reusing a token
 * across video IDs or switching clients yields a 403 on subsequent ranges.
 *
 * Phase 2 will implement the provider body using youtubei.js 17.2's built-in
 * `serviceIntegrityDimensions.poToken` support. For now `getPOToken` returns
 * `undefined` so the resolver continues to work without a token (useful to
 * confirm which streams are still accessible before enforcement).
 */

export type POTokenContext = {
  videoId: string;
  client: 'IOS' | 'YTMUSIC_ANDROID' | 'ANDROID_VR' | 'TV';
  visitorData: string;
  token: string;
  /** Unix timestamp (ms) after which this token must be refreshed. */
  expiresAt: number;
};

/** Cache key: `${client}:${videoId}:${visitorData}` */
const poTokenCache = new Map<string, POTokenContext>();

const cacheKey = (videoId: string, client: string, visitorData = '') =>
  `${client}:${videoId}:${visitorData}`;

/**
 * Returns a fresh or cached PO Token for the given stream identity, or
 * `undefined` if no token is available (Phase 1 - stub only).
 *
 * Phase 2: call the youtubei.js token provider and cache the result by
 * (client, videoId, visitorData). Pass the returned string to
 * `getStreamingData(..., { po_token })` in `directYouTubeResolver.ts`.
 */
export const getPOToken = async (
  _videoId: string,
  _client: string,
  _visitorData?: string
): Promise<string | undefined> => {
  // Phase 2: integrate with youtubei.js 17.2 po_token provider.
  // const key = cacheKey(_videoId, _client, _visitorData);
  // const cached = poTokenCache.get(key);
  // if (cached && cached.expiresAt > Date.now()) return cached.token;
  // const ctx = await resolveNewToken(_videoId, _client, _visitorData);
  // poTokenCache.set(key, ctx);
  // return ctx.token;
  return undefined;
};

/**
 * Evicts the cached token for the given identity. Call this immediately when
 * GVS returns a 403 with `gvsEnforcement: true` so the next resolve fetches a
 * fresh token rather than reusing the invalidated one.
 */
export const invalidatePOToken = (
  videoId: string,
  client: string,
  visitorData?: string
): void => {
  poTokenCache.delete(cacheKey(videoId, client, visitorData));
};

/** Test helper - resets the entire PO Token cache between test cases. */
export const _resetPOTokenCacheForTests = (): void => {
  poTokenCache.clear();
};
