import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpoUpdateServer } from '../temporary-expo-update-server.mjs';

const makeExport = async (directory) => {
  await mkdir(path.join(directory, '_expo', 'static', 'js', 'ios'), { recursive: true });
  await mkdir(path.join(directory, '_expo', 'static', 'js', 'android'), { recursive: true });
  await mkdir(path.join(directory, 'assets'), { recursive: true });
  await writeFile(path.join(directory, '_expo/static/js/ios/main.js'), 'ios bundle');
  await writeFile(path.join(directory, '_expo/static/js/android/main.js'), 'android bundle');
  await writeFile(path.join(directory, 'assets/cover.png'), Buffer.from([1, 2, 3]));
  await writeFile(
    path.join(directory, 'metadata.json'),
    JSON.stringify({
      version: 0,
      fileMetadata: {
        ios: { bundle: '_expo/static/js/ios/main.js', assets: [{ path: 'assets/cover.png', ext: 'png' }] },
        android: { bundle: '_expo/static/js/android/main.js', assets: [{ path: 'assets/cover.png', ext: 'png' }] },
      },
    })
  );
};

const startServer = async (directory) => {
  const server = await createExpoUpdateServer({
    directory,
    runtimeVersion: '1.0.2',
    expoConfig: { name: 'Openfy' },
    createdAt: '2026-10-01T12:00:00.000Z',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
};

test('serves a platform-specific Expo manifest and its verified assets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openfy-ota-'));
  await makeExport(directory);
  const { server, origin } = await startServer(directory);

  try {
    const manifestResponse = await fetch(`${origin}/api/manifest`, {
      headers: {
        'x-forwarded-host': 'ota-test.trycloudflare.com',
        'expo-platform': 'ios',
        'expo-protocol-version': '1',
        'expo-runtime-version': '1.0.2',
      },
    });
    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers.get('expo-protocol-version'), '1');
    const manifest = await manifestResponse.json();
    assert.equal(manifest.runtimeVersion, '1.0.2');
    assert.equal(manifest.launchAsset.url, 'https://ota-test.trycloudflare.com/api/assets?platform=ios&asset=_expo%2Fstatic%2Fjs%2Fios%2Fmain.js');
    assert.equal(manifest.assets[0].contentType, 'image/png');

    const publicAssetUrl = new URL(manifest.assets[0].url);
    const assetResponse = await fetch(`${origin}${publicAssetUrl.pathname}${publicAssetUrl.search}`);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('content-type'), 'image/png');
    const assetBody = Buffer.from(await assetResponse.arrayBuffer());
    assert.equal(manifest.assets[0].hash, createHash('sha256').update(assetBody).digest('base64url'));

    const health = await fetch(`${origin}/health`).then((response) => response.json());
    assert.equal(health.updateId, manifest.id);
    assert.equal(health.createdAt, manifest.createdAt);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects incompatible runtimes and non-exported assets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openfy-ota-'));
  await makeExport(directory);
  const { server, origin } = await startServer(directory);

  try {
    const incompatible = await fetch(`${origin}/api/manifest`, {
      headers: {
        'x-forwarded-host': 'ota-test.trycloudflare.com',
        'expo-platform': 'ios',
        'expo-protocol-version': '1',
        'expo-runtime-version': '0.9.0',
      },
    });
    assert.equal(incompatible.status, 404);

    const traversal = await fetch(`${origin}/api/assets?platform=ios&asset=${encodeURIComponent('../metadata.json')}`);
    assert.equal(traversal.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
