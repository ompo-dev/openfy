import axios from 'axios';
import { createRequire } from 'node:module';

import { handleNodeServerRequest } from './nodeRequestAdapter';

const require = createRequire(import.meta.url);
const { server } = require('./legacyEngine.js') as {
  server: Parameters<typeof handleNodeServerRequest>[0];
};

const remoteEngineClient = axios.create({
  timeout: 30_000,
  maxRedirects: 0,
  validateStatus: () => true,
});

const getRemoteEngineUrl = () => {
  const value = process.env.OPENFY_LEGACY_ENGINE_URL?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
};

const forwardToRemoteEngine = async (request: Request, baseUrl: string) => {
  const requestUrl = new URL(request.url);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  const headers = Object.fromEntries(
    [...request.headers.entries()].filter(([name]) => !['host', 'content-length'].includes(name))
  );
  const response = await remoteEngineClient.request<ArrayBuffer>({
    baseURL: baseUrl,
    url: `${requestUrl.pathname}${requestUrl.search}`,
    method: request.method,
    headers,
    data: body,
    responseType: 'arraybuffer',
    signal: request.signal,
  });
  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
  }
  return new Response(response.data, { headers: responseHeaders, status: response.status });
};

/**
 * Runs the legacy resolver in-process during the migration. Set
 * OPENFY_LEGACY_ENGINE_URL to send the heavy workload to a dedicated service.
 */
export const forwardLegacyRequest = (request: Request) => {
  const remoteEngineUrl = getRemoteEngineUrl();
  return remoteEngineUrl
    ? forwardToRemoteEngine(request, remoteEngineUrl)
    : handleNodeServerRequest(server, request);
};
