import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForOtaHealth } from '../wait-for-ota-health.mjs';

const health = { ok: true, runtimeVersion: '1.0.2', updateId: 'expected-id', createdAt: '2026-10-05T12:00:00.000Z' };
const options = { runtimeVersion: health.runtimeVersion, expectedUpdateId: health.updateId, timeoutMs: 1000, intervalMs: 5 };

test('waits for HTTP readiness and verifies the expected update before publishing', async () => {
  let attempts = 0;
  const server = createServer((_request, response) => {
    attempts += 1;
    response.writeHead(attempts < 3 ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(health));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await waitForOtaHealth({ ...options, url: origin }), { ...health, origin });
    assert.equal(attempts, 3);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('retries connection failures, invalid JSON and another update', async () => {
  let attempts = 0;
  const result = await waitForOtaHealth({
    ...options, url: 'https://ota-test.trycloudflare.com',
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      if (attempts === 2) return new Response('not JSON');
      return Response.json(attempts === 3 ? { ...health, updateId: 'wrong-id' } : health);
    },
  });
  assert.equal(result.updateId, health.updateId);
  assert.equal(attempts, 4);
});

test('waits for a tunnel hostname to appear in the real log', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openfy-tunnel-'));
  const tunnelLog = path.join(directory, 'cloudflared.log');
  await writeFile(tunnelLog, 'Requesting a quick tunnel');
  const timer = setTimeout(() => void writeFile(tunnelLog,
    'Created quick tunnel https://fresh-tunnel.trycloudflare.com\n'), 20);
  try {
    const result = await waitForOtaHealth({ ...options, tunnelLog,
      fetchImpl: async (url) => {
        assert.equal(url, 'https://fresh-tunnel.trycloudflare.com/health');
        return Response.json({ ...health, origin: 'untrusted-value' });
      },
    });
    assert.equal(result.origin, 'https://fresh-tunnel.trycloudflare.com');
  } finally {
    clearTimeout(timer);
    await rm(directory, { recursive: true, force: true });
  }
});

test('fails with a diagnostic instead of returning an unready tunnel', async () => {
  await assert.rejects(waitForOtaHealth({ ...options, timeoutMs: 50,
    url: 'https://ota-test.trycloudflare.com',
    fetchImpl: async () => { throw new Error('fetch failed', { cause: { code: 'ECONNREFUSED' } }); },
  }), /timed out.*ECONNREFUSED/);
});

test('rejects a response from an incompatible runtime', async () => {
  await assert.rejects(waitForOtaHealth({ ...options, timeoutMs: 50,
    url: 'https://ota-test.trycloudflare.com',
    fetchImpl: async () => Response.json({ ...health, runtimeVersion: 'old-runtime' }),
  }), /Unexpected OTA health response/);
});

test('times out stalled network requests', async () => {
  const server = createServer(() => {});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(waitForOtaHealth({ ...options, timeoutMs: 100, requestTimeoutMs: 20,
      url: `http://127.0.0.1:${server.address().port}`,
    }), /OTA readiness timed out/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('does not wait for a process that has already stopped', async () => {
  await assert.rejects(waitForOtaHealth({ ...options, url: 'http://127.0.0.1', processIds: [2147483647] }),
    /stopped before becoming ready/);
});
