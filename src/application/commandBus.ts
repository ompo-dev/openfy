import { log, type LogCategory } from '../../utils/appLogger';

type Command<T> = {
  name: string;
  idempotencyKey?: string;
  category?: LogCategory;
  successTtlMs?: number;
  isSuccess?: (value: T) => boolean;
  execute: () => Promise<T> | T;
};

type CompletedCommand = { expiresAt: number; value: unknown };

const inFlight = new Map<string, Promise<unknown>>();
const completed = new Map<string, CompletedCommand>();
const MAX_COMPLETED_COMMANDS = 300;

const commandKey = (name: string, key: string) => `${name}:${key}`;

const pruneCompleted = (now: number) => {
  for (const [key, entry] of completed) {
    if (entry.expiresAt <= now) completed.delete(key);
  }
  while (completed.size > MAX_COMPLETED_COMMANDS) {
    const oldest = completed.keys().next().value;
    if (oldest === undefined) break;
    completed.delete(oldest);
  }
};

/** Deduplicates concurrent commands and briefly replays successful retries. */
export const executeCommand = <T>({
  name,
  idempotencyKey,
  category = 'ui',
  successTtlMs = 1_500,
  isSuccess = () => true,
  execute,
}: Command<T>): Promise<T> => {
  const key = idempotencyKey?.trim();
  const registryKey = key ? commandKey(name, key) : null;
  const now = Date.now();
  pruneCompleted(now);

  if (registryKey) {
    const cached = completed.get(registryKey);
    if (cached && cached.expiresAt > now) {
      log[category]('command idempotency replay', { name, key });
      return Promise.resolve(cached.value as T);
    }
    const pending = inFlight.get(registryKey);
    if (pending) {
      log[category]('command deduplicated in flight', { name, key });
      return pending as Promise<T>;
    }
  }

  const finish = log.time(category, `command ${name}`, {
    idempotencyKey: key,
  });
  const request = Promise.resolve()
    .then(execute)
    .then((value) => {
      const succeeded = isSuccess(value);
      finish({ ok: succeeded });
      if (registryKey && successTtlMs > 0 && succeeded) {
        completed.delete(registryKey);
        completed.set(registryKey, {
          expiresAt: Date.now() + successTtlMs,
          value,
        });
        pruneCompleted(Date.now());
      }
      return value;
    })
    .catch((error: unknown) => {
      finish({ ok: false, error: String(error) });
      throw error;
    })
    .finally(() => {
      if (registryKey && inFlight.get(registryKey) === request) {
        inFlight.delete(registryKey);
      }
    });

  if (registryKey) inFlight.set(registryKey, request);
  return request;
};

export const clearCommandStateForTests = () => {
  inFlight.clear();
  completed.clear();
};
