/** @jest-environment node */

import { handleNodeServerRequest } from '../expoRequestAdapter';

describe('Expo API adapter', () => {
  it('forwards a JSON POST body to the music resolver', async () => {
    const server = {
      emit: (_event: string, request: any, response: any) => {
        let body = '';
        request.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        request.on('end', () => {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(body);
        });
      },
    } as any;
    const response = await handleNodeServerRequest(
      server,
      new Request('http://localhost:8081/api/music/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Mafioso' }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      title: 'Mafioso',
    });
  });

  it('preserves a not-found response', async () => {
    const server = {
      emit: (_event: string, _request: unknown, response: any) => {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Not found' }));
      },
    } as any;
    const response = await handleNodeServerRequest(
      server,
      new Request('http://localhost:8081/api/unknown')
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });
});
