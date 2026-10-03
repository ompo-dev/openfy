import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeTemporaryOTAPointer } from '../write-temporary-ota-pointer.mjs';

test('publishes the served update id and creation time with the active OTA pointer', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openfy-ota-pointer-'));
  const output = path.join(directory, 'pointer.json');

  try {
    const pointer = await writeTemporaryOTAPointer(new Map([
      ['output', output],
      ['active', 'true'],
      ['update-url', 'https://openfy-ci.trycloudflare.com/api/manifest'],
      ['runtime-version', '1.0.2'],
      ['update-id', '123e4567-e89b-12d3-a456-426614174000'],
      ['created-at', '2026-10-01T12:00:00.000Z'],
      ['run-id', '123'],
      ['duration-seconds', '605'],
    ]));

    assert.equal(pointer.updateId, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(pointer.createdAt, '2026-10-01T12:00:00.000Z');
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), pointer);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
