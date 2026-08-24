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

  it('exposes Swagger documentation', async () => {
    const response = await app.handle(new Request('http://localhost:3001/swagger'));

    expect(response.status).toBe(200);
  });
});
