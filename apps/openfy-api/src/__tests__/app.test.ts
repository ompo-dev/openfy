import { describe, expect, it } from 'bun:test';
import { createApiApp } from '../app';

describe('Openfy API', () => {
  const app = createApiApp({
    forwardLegacyRequest: async () => new Response(JSON.stringify({ ok: true })),
  });

  it('reports a versioned health contract', async () => {
    const response = await app.handle(new Request('http://localhost:3001/health'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { service: 'openfy-api', status: 'ok' },
    });
  });

  it('allows the local Expo web origin through CORS', async () => {
    const response = await app.handle(
      new Request('http://localhost:3001/health', {
        headers: { origin: 'http://localhost:8081' },
      })
    );

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
  });

  it('answers local Expo preflight requests', async () => {
    const response = await app.handle(
      new Request('http://localhost:3001/api/music/resolve', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:8081',
          'access-control-request-method': 'POST',
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('rejects an invalid YouTube import before it reaches the resolver', async () => {
    const response = await app.handle(
      new Request('http://localhost:3001/api/music/youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/not-youtube' }),
      })
    );

    expect(response.status).toBe(422);
  });

  it('forwards a valid resolve request to the engine', async () => {
    let forwardedPath = '';
    let forwardedBody: unknown;
    const forwardingApp = createApiApp({
      forwardLegacyRequest: async (request) => {
        forwardedPath = new URL(request.url).pathname;
        forwardedBody = await request.json();
        return Response.json({ source: { streamUrl: 'https://media.test/track.m4a' } });
      },
    });

    const response = await forwardingApp.handle(
      new Request('http://localhost:3001/api/music/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Gods Plan', artist: 'Drake' }),
      })
    );

    expect(response.status).toBe(200);
    expect(forwardedPath).toBe('/api/music/resolve');
    expect(forwardedBody).toEqual({ title: 'Gods Plan', artist: 'Drake' });
  });

  it('forwards a valid YouTube URL after Elysia validates its body', async () => {
    let forwardedBody: unknown;
    const forwardingApp = createApiApp({
      forwardLegacyRequest: async (request) => {
        forwardedBody = await request.json();
        return Response.json({ ok: true });
      },
    });

    const response = await forwardingApp.handle(
      new Request('http://localhost:3001/api/music/youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=iciIG5tw-hk' }),
      })
    );

    expect(response.status).toBe(200);
    expect(forwardedBody).toEqual({ url: 'https://www.youtube.com/watch?v=iciIG5tw-hk' });
  });

  it('returns a generic error when the engine fails', async () => {
    const failingApp = createApiApp({
      forwardLegacyRequest: async () => {
        throw new Error('private upstream failure');
      },
    });

    const response = await failingApp.handle(
      new Request('http://localhost:3001/api/music/youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=m1a_GqJf02M' }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('exposes Swagger documentation', async () => {
    const response = await app.handle(new Request('http://localhost:3001/swagger'));

    expect(response.status).toBe(200);
  });
});
