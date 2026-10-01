import { createAsyncResourceCache } from '../asyncResourceCache';

describe('AsyncResourceCache', () => {
  it('coalesces concurrent requests and reuses successful values', async () => {
    const cache = createAsyncResourceCache<string>({ name: 'test' });
    const load = jest.fn().mockResolvedValue('value');

    const [first, concurrent] = await Promise.all([
      cache.getOrLoad('key', load, 1_000),
      cache.getOrLoad('key', load, 1_000),
    ]);
    const cached = await cache.getOrLoad('key', load, 1_000);

    expect([first, concurrent, cached]).toEqual(['value', 'value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('expires cached values after their TTL', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const cache = createAsyncResourceCache<string>({ name: 'ttl' });
    const load = jest.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await expect(cache.getOrLoad('key', load, 10)).resolves.toBe('first');
    now.mockReturnValue(1_011);
    await expect(cache.getOrLoad('key', load, 10)).resolves.toBe('second');

    expect(load).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('prevents invalidated in-flight work from repopulating the cache', async () => {
    const cache = createAsyncResourceCache<string>({ name: 'invalidation' });
    let resolveStale!: (value: string) => void;
    const staleRequest = cache.getOrLoad(
      'key',
      () => new Promise((resolve) => { resolveStale = resolve; }),
      1_000
    );
    await Promise.resolve();
    cache.clear();

    const freshRequest = cache.getOrLoad('key', async () => 'fresh', 1_000);
    resolveStale('stale');
    await staleRequest;
    await expect(freshRequest).resolves.toBe('fresh');
    await expect(cache.getOrLoad('key', async () => 'unexpected', 1_000))
      .resolves.toBe('fresh');
  });
});
