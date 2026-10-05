import { createYouTubeMusicClient } from '../youtubeMusicRuntime.web';

const mockCreate = jest.fn();
jest.mock('youtubei.js/web.bundle', () => ({
  Innertube: { create: (...args: unknown[]) => mockCreate(...args) },
}));

it('uses the vendor web bundle and keeps the browser fetch receiver', async () => {
  const originalFetch = globalThis.fetch;
  const fetch = jest.fn(function (this: unknown) {
    expect(this).toBe(globalThis);
    return Promise.resolve({ ok: true });
  });
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  const client = { music: {} };
  mockCreate.mockImplementation(async (options) => {
    await options.fetch.call({}, 'https://music.youtube.com');
    return client;
  });
  try {
    expect(await createYouTubeMusicClient({ retrieve_player: false })).toBe(client);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ retrieve_player: false }));
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
