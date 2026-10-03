import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const parseArgs = (args) => {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const [key, inlineValue] = args[index].split('=', 2);
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const value = inlineValue ?? args[++index];
    if (value === undefined) throw new Error(`Missing value for ${key}`);
    values.set(key.slice(2), value);
  }
  return values;
};

export async function writeTemporaryOTAPointer(args) {
  const output = args.get('output');
  if (!output) throw new Error('Missing --output path.');
  const outputPath = path.resolve(output);
  const active = args.get('active') === 'true';
  const now = new Date();
  let pointer;

  if (active) {
    const updateUrl = args.get('update-url');
    const runtimeVersion = args.get('runtime-version');
    const updateId = args.get('update-id');
    const createdAt = args.get('created-at');
    const runId = Number(args.get('run-id'));
    const durationSeconds = Number(args.get('duration-seconds') || 630);
    if (
      !updateUrl ||
      !runtimeVersion ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updateId || '') ||
      !createdAt || !Number.isFinite(Date.parse(createdAt)) ||
      !Number.isSafeInteger(runId) ||
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds < 600 ||
      durationSeconds > 660
    ) {
      throw new Error('Invalid active pointer data or duration.');
    }
    const url = new URL(updateUrl);
    if (
      url.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(url.hostname) ||
      url.pathname !== '/api/manifest' ||
      url.search ||
      url.hash
    ) {
      throw new Error('The update URL must use an HTTPS Cloudflare Quick Tunnel.');
    }
    pointer = {
      schemaVersion: 1,
      active: true,
      updateUrl,
      runtimeVersion,
      updateId,
      createdAt,
      runId,
      commitSha: args.get('commit-sha') || '',
      publishedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + durationSeconds * 1000).toISOString(),
    };
  } else {
    pointer = JSON.parse(await readFile(outputPath, 'utf8'));
    pointer.active = false;
    pointer.endedAt = now.toISOString();
    pointer.expiresAt = now.toISOString();
  }

  await writeFile(outputPath, `${JSON.stringify(pointer, null, 2)}\n`);
  return pointer;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  writeTemporaryOTAPointer(parseArgs(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
