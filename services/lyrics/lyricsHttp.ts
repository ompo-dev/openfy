import { Platform } from 'react-native';
import { log } from '../../utils/appLogger';

type RequestOptions = { provider: string; signal?: AbortSignal; trackId?: string; headers?: Record<string, string> };
let requestId = 0;
export class LyricsHttpError extends Error {
  constructor(public readonly status: number) { super(`lyrics_http_${status}`); }
}

export const requestLyricsText = async (endpoint: string, options: RequestOptions): Promise<string | null> => {
  const id = ++requestId;
  const address = new URL(endpoint);
  const meta = { requestId: id, provider: options.provider, trackId: options.trackId,
    platform: Platform.OS, host: address.hostname, path: address.pathname };
  const finish = log.time('network', 'lyrics HTTP request', meta);
  let status: number | undefined;
  let onAbort: (() => void) | undefined;
  try {
    if (options.signal?.aborted) throw new Error('lyrics_request_cancelled');
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('lyrics_request_cancelled'));
      options.signal?.addEventListener('abort', onAbort, { once: true });
    });
    const response = await Promise.race([fetch(endpoint, { signal: options.signal,
      headers: { 'User-Agent': 'Openfy/1.0 (https://github.com/ompo-dev/openfy)',
        Accept: 'application/json, application/ttml+xml, text/plain, */*', ...options.headers } }), cancelled]);
    status = response.status;
    if (status === 404 || status === 204) { finish({ ...meta, ok: true, status, outcome: 'not-found' }); return null; }
    if (!response.ok) throw new LyricsHttpError(status);
    const body = await Promise.race([response.text(), cancelled]);
    if (body.length > 2_000_000) throw new Error('lyrics_response_too_large');
    finish({ ...meta, ok: true, status, characters: body.length, contentType: response.headers?.get('content-type') });
    return body.trim() ? body : null;
  } catch (error) {
    const cancelled = options.signal?.aborted === true;
    finish({ ...meta, ok: cancelled, status, outcome: cancelled ? 'cancelled' : 'error', error: String(error) });
    if (!cancelled) log.error('lyrics HTTP failed', { ...meta, status, error });
    throw error;
  } finally { if (onAbort) options.signal?.removeEventListener('abort', onAbort); }
};

export const requestLyricsJson = async (endpoint: string, options: RequestOptions): Promise<unknown> => {
  const body = await requestLyricsText(endpoint, options);
  if (!body) return null;
  try { return JSON.parse(body); }
  catch (error) {
    log.error('lyrics JSON decode failed', { provider: options.provider, trackId: options.trackId,
      host: new URL(endpoint).hostname, bytes: body.length, error });
    throw error;
  }
};
