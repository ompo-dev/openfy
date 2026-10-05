import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function waitForOtaHealth({
  url,
  tunnelLog,
  runtimeVersion,
  expectedUpdateId,
  timeoutMs = 90_000,
  requestTimeoutMs = 5000,
  intervalMs = 2000,
  processIds = [],
  fetchImpl = fetch,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'Waiting for the tunnel hostname.';

  while (Date.now() < deadline) {
    for (const pid of processIds) {
      try { process.kill(pid, 0); } catch {
        throw new Error(`OTA process ${pid} stopped before becoming ready.`);
      }
    }

    try {
      let origin = url;
      if (tunnelLog) {
        const log = await readFile(tunnelLog, 'utf8');
        origin = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/gi)?.at(-1);
      }
      if (origin) {
        const response = await fetchImpl(`${origin}/health`, {
          signal: AbortSignal.timeout(Math.max(1, Math.min(requestTimeoutMs, deadline - Date.now()))),
          redirect: 'error',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} from ${origin}/health`);
        const health = await response.json();
        if (health.ok !== true || health.runtimeVersion !== runtimeVersion ||
            typeof health.updateId !== 'string' || !health.updateId ||
            typeof health.createdAt !== 'string' || !Number.isFinite(Date.parse(health.createdAt)) ||
            (expectedUpdateId && health.updateId !== expectedUpdateId)) {
          throw new Error(`Unexpected OTA health response from ${origin}.`);
        }
        return { ...health, origin };
      }
    } catch (error) {
      lastError = `${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''}`;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) await sleep(Math.min(intervalMs, remainingMs));
  }
  throw new Error(`OTA readiness timed out after ${timeoutMs}ms: ${lastError}`);
}

async function main() {
  const args = new Map();
  const processIds = [];
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key.startsWith('--') || !value) throw new Error(`Invalid argument: ${key}`);
    if (key === '--process-id') processIds.push(Number(value));
    else args.set(key, value);
  }
  const timeoutMs = Number(args.get('--timeout-ms') || 90_000);
  if ((!args.has('--url') && !args.has('--tunnel-log')) || !args.has('--runtime-version') ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
      processIds.some((pid) => !Number.isInteger(pid) || pid <= 0)) {
    throw new Error('Expected an origin URL or tunnel log, runtime version and valid timeout/process IDs.');
  }
  const health = await waitForOtaHealth({
    url: args.get('--url'),
    tunnelLog: args.get('--tunnel-log'),
    runtimeVersion: args.get('--runtime-version'),
    expectedUpdateId: args.get('--expected-update-id'),
    timeoutMs,
    processIds,
  });
  process.stdout.write(`${JSON.stringify(health)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
