import { fetchWithTimeout } from '../timeoutSignal';

describe('fetchWithTimeout', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const originalAbortController = global.AbortController;

  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.AbortController = originalAbortController;
  });

  it('works when Hermes does not expose AbortSignal.timeout', async () => {
    global.AbortController = undefined as unknown as typeof AbortController;

    await expect(fetchWithTimeout('https://music.test', {}, 10)).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith('https://music.test', {
      signal: undefined,
    });
  });
});
