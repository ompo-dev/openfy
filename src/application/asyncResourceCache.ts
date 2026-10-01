import { log, type LogCategory } from '../../utils/appLogger';

type CacheEntry<Value> = { value: Value; expiresAt: number };

type AsyncResourceCacheOptions<Value> = {
  name: string;
  category?: LogCategory;
  maxEntries?: number;
  ttlFor?: (value: Value) => number;
  shouldCache?: (value: Value) => boolean;
};

/** Bounded TTL cache with request coalescing, explicit invalidation, and metrics. */
export class AsyncResourceCache<Value> {
  private readonly values = new Map<string, CacheEntry<Value>>();
  private readonly inFlight = new Map<string, Promise<Value>>();
  private readonly category: LogCategory;
  private readonly maxEntries: number;

  constructor(private readonly options: AsyncResourceCacheOptions<Value>) {
    this.category = options.category || 'network';
    this.maxEntries = Math.max(1, options.maxEntries || 100);
  }

  async getOrLoad(
    key: string,
    load: () => Promise<Value>,
    ttlMs: number
  ): Promise<Value> {
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.values.delete(key);
      this.values.set(key, cached);
      log[this.category]('cache hit', { cache: this.options.name });
      return cached.value;
    }
    if (cached) this.values.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) {
      log[this.category]('cache request coalesced', { cache: this.options.name });
      return pending;
    }

    const finish = log.time(this.category, `cache ${this.options.name} load`);
    const request = Promise.resolve()
      .then(load)
      .then((value) => {
        const ttl = Math.max(0, this.options.ttlFor?.(value) ?? ttlMs);
        const isCurrentRequest = this.inFlight.get(key) === request;
        const didCache = isCurrentRequest && ttl > 0 &&
          (this.options.shouldCache?.(value) ?? true);
        if (didCache) {
          this.values.delete(key);
          this.values.set(key, { value, expiresAt: Date.now() + ttl });
          this.trim();
        }
        finish({ ok: true, cached: didCache });
        return value;
      })
      .catch((error: unknown) => {
        finish({ ok: false, error: String(error) });
        throw error;
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }

  set(key: string, value: Value, ttlMs: number) {
    this.inFlight.delete(key);
    if (ttlMs <= 0) {
      this.delete(key);
      return;
    }
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.trim();
  }

  delete(key: string) {
    this.values.delete(key);
    this.inFlight.delete(key);
  }

  clear() {
    this.values.clear();
    this.inFlight.clear();
  }

  private trim() {
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) return;
      this.values.delete(oldest);
    }
  }
}

export const createAsyncResourceCache = <Value>(
  options: AsyncResourceCacheOptions<Value>
) => new AsyncResourceCache<Value>(options);
