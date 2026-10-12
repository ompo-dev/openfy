import { clearLogBuffer, getLogBuffer, logConfig } from '../../../utils/appLogger';
import { LyricsHttpError, requestLyricsJson, requestLyricsText } from '../lyricsHttp';

describe('lyric HTTP diagnostics', () => {
  beforeEach(() => { jest.mocked(fetch).mockReset(); clearLogBuffer(); logConfig.capture = true; });
  it('logs HTTP status and counts, not lyric bodies or credentials', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: true, status: 200, text: async () => 'PRIVATE LYRIC CONTENT',
      headers: { get: () => 'text/plain' } } as unknown as Response);
    await expect(requestLyricsText('https://provider.test/lyrics?token=SECRET',
      { provider: 'test', headers: { Authorization: 'Bearer SECRET' } })).resolves.toBe('PRIVATE LYRIC CONTENT');
    const logs = JSON.stringify(getLogBuffer());
    expect(logs).toContain('lyrics HTTP request finished');
    expect(logs).toContain('characters');
    expect(logs).not.toContain('PRIVATE LYRIC CONTENT');
    expect(logs).not.toContain('SECRET');
  });
  it('distinguishes absent documents, restricted requests and invalid JSON', async () => {
    jest.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(requestLyricsText('https://provider.test/lyrics', { provider: 'test' })).resolves.toBeNull();
    jest.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    await expect(requestLyricsText('https://provider.test/lyrics', { provider: 'test' })).rejects.toBeInstanceOf(LyricsHttpError);
    jest.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<html>Error</html>' } as Response);
    await expect(requestLyricsJson('https://provider.test/lyrics', { provider: 'test' })).rejects.toThrow();
    const logs = JSON.stringify(getLogBuffer());
    expect(logs).toContain('not-found');
    expect(logs).toContain('401');
    expect(logs).toContain('lyrics JSON decode failed');
  });
  it('bounds a stalled body when the caller cancels, even if transport ignores abort', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: true, status: 200, text: () => new Promise(() => {}) } as Response);
    const controller = new AbortController();
    const result = requestLyricsText('https://provider.test/lyrics', { provider: 'test', signal: controller.signal });
    await Promise.resolve(); await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toThrow('lyrics_request_cancelled');
    expect(JSON.stringify(getLogBuffer())).toContain('cancelled');
  });
});
