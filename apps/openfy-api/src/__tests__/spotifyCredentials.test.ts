import { afterEach, describe, expect, it } from 'bun:test';

import { getSpotifyClientAccessToken } from '../spotifyCredentials';

const originalClientId = process.env.SPOTIFY_CLIENT_ID;
const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env.SPOTIFY_CLIENT_ID = originalClientId;
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;
  globalThis.fetch = originalFetch;
});

describe('Spotify server credentials', () => {
  it('keeps the client secret server-side while returning only a temporary access token', async () => {
    process.env.SPOTIFY_CLIENT_ID = 'server-client-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'server-client-secret';
    let authorization = '';
    globalThis.fetch = (async (_input, init) => {
      authorization = new Headers(init?.headers).get('authorization') || '';
      return Response.json({ access_token: 'temporary-token', expires_in: 3600 });
    }) as typeof fetch;

    await expect(getSpotifyClientAccessToken()).resolves.toBe('temporary-token');
    expect(authorization).toStartWith('Basic ');
    expect(authorization).not.toContain('server-client-secret');
  });
});
