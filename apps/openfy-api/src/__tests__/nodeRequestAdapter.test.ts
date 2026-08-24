import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { handleNodeServerRequest } from '../nodeRequestAdapter';

describe('handleNodeServerRequest', () => {
  it('preserves a streamed partial-audio response and its range headers', async () => {
    const server = new EventEmitter();
    server.on('request', (_request, response) => {
      response.writeHead(206, {
        'Content-Type': 'audio/mp4',
        'Content-Range': 'bytes 0-5/6',
        'Accept-Ranges': 'bytes',
      });
      response.write(Buffer.from('ope'));
      response.end(Buffer.from('nfy'));
    });

    const response = await handleNodeServerRequest(
      server,
      new Request('http://localhost:3001/api/audio/proxy', {
        headers: { range: 'bytes=0-5' },
      })
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('audio/mp4');
    expect(response.headers.get('content-range')).toBe('bytes 0-5/6');
    await expect(response.text()).resolves.toBe('openfy');
  });

  it('forwards POST request bodies to the legacy handler', async () => {
    const server = new EventEmitter();
    server.on('request', (request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(body);
      });
    });

    const response = await handleNodeServerRequest(
      server,
      new Request('http://localhost:3001/api/music/resolve', {
        method: 'POST',
        body: JSON.stringify({ title: 'Gods Plan' }),
      })
    );

    await expect(response.json()).resolves.toEqual({ title: 'Gods Plan' });
  });
});
