import { node } from '@elysia/node';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { Elysia, t } from 'elysia';

export type LegacyRequestForwarder = (request: Request) => Promise<Response>;

type ApiAppOptions = {
  forwardLegacyRequest: LegacyRequestForwarder;
};

const youtubeUrlPattern = '^https?://(?:www\\.)?(?:youtube\\.com|music\\.youtube\\.com|youtu\\.be)/';

const resolveRequestSchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 300 })),
  artist: t.Optional(t.String({ maxLength: 300 })),
  artists: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 300 }), { maxItems: 12 })),
  albumName: t.Optional(t.String({ maxLength: 300 })),
  durationMs: t.Optional(t.Number({ minimum: 0, maximum: 7_200_000 })),
  spotifyId: t.Optional(t.String({ maxLength: 120 })),
  releaseDate: t.Optional(t.String({ maxLength: 40 })),
  includeLyrics: t.Optional(t.Boolean()),
});

const proxyQuerySchema = t.Object({
  url: t.String({ format: 'uri', maxLength: 8_192 }),
});

const isKnownResolveRequest = (body: { title?: string; spotifyId?: string }) =>
  Boolean(body.title?.trim() || body.spotifyId?.trim());

const forwardValidatedJsonRequest = (
  request: Request,
  body: unknown,
  forwardLegacyRequest: LegacyRequestForwarder
) => {
  const serializedBody = JSON.stringify(body);
  if (!serializedBody) {
    throw new TypeError('Validated request body cannot be serialized');
  }

  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  headers.set('content-length', String(new TextEncoder().encode(serializedBody).byteLength));

  return forwardLegacyRequest(
    new Request(request.url, {
      method: request.method,
      headers,
      body: serializedBody,
    })
  );
};

const configuredOrigins = new Set(
  (process.env.OPENFY_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const isAllowedCorsOrigin = (origin: string | null) => {
  if (!origin) return false;
  if (configuredOrigins.has(origin)) return true;
  if (process.env.NODE_ENV === 'production') return false;

  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
};

export const createApiApp = ({ forwardLegacyRequest }: ApiAppOptions) =>
  new Elysia({ adapter: node() })
    .use(
      cors({
        origin: (request) => isAllowedCorsOrigin(request.headers.get('origin')),
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
        exposeHeaders: ['Accept-Ranges', 'Content-Length', 'Content-Range'],
      })
    )
    .use(
      swagger({
        path: '/swagger',
        documentation: {
          info: {
            title: 'Openfy API',
            version: '1.0.0',
            description: 'API compartilhada pelo Openfy Web, Android e iPhone.',
          },
          tags: [
            { name: 'Health', description: 'Disponibilidade do serviço' },
            { name: 'Music', description: 'Resolução de faixas e importação' },
            { name: 'Audio', description: 'Streaming de áudio com suporte a Range' },
            { name: 'Metadata', description: 'Letras e metadados de Spotify/YouTube' },
          ],
        },
      })
    )
    .onError(({ code, error, set }) => {
      if (code === 'VALIDATION') {
        set.status = 422;
        return {
          success: false,
          error: { code: 'VALIDATION_FAILED', message: error.message },
        };
      }

      console.error('[Openfy API] Unexpected request failure', error);
      set.status = 500;
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      };
    })
    .get(
      '/health',
      () => ({
        success: true,
        data: {
          service: 'openfy-api',
          status: 'ok',
          time: new Date().toISOString(),
        },
      }),
      { detail: { tags: ['Health'], summary: 'Verifica a disponibilidade da API' } }
    )
    .get('/api/lyrics', ({ request }) => forwardLegacyRequest(request), {
      query: t.Object({
        title: t.String({ minLength: 1, maxLength: 300 }),
        artist: t.Optional(t.String({ maxLength: 300 })),
        durationMs: t.Optional(t.Numeric({ minimum: 0, maximum: 7_200_000 })),
        album: t.Optional(t.String({ maxLength: 300 })),
      }),
      detail: { tags: ['Metadata'], summary: 'Obtém letras sincronizadas quando disponíveis' },
    })
    .get('/api/spotify/playlist/:id', ({ request }) => forwardLegacyRequest(request), {
      params: t.Object({ id: t.String({ pattern: '^[A-Za-z0-9]+$' }) }),
      detail: { tags: ['Metadata'], summary: 'Obtém uma playlist canônica do Spotify' },
    })
    .get('/api/spotify/album/:id', ({ request }) => forwardLegacyRequest(request), {
      params: t.Object({ id: t.String({ pattern: '^[A-Za-z0-9]+$' }) }),
      detail: { tags: ['Metadata'], summary: 'Obtém um álbum canônico do Spotify' },
    })
    .get('/api/spotify/track/:id', ({ request }) => forwardLegacyRequest(request), {
      params: t.Object({ id: t.String({ pattern: '^[A-Za-z0-9]+$' }) }),
      detail: { tags: ['Metadata'], summary: 'Obtém uma faixa canônica do Spotify' },
    })
    .get('/api/youtube/artist-image', ({ request }) => forwardLegacyRequest(request), {
      query: t.Object({ artist: t.String({ minLength: 1, maxLength: 160 }) }),
      detail: { tags: ['Metadata'], summary: 'Obtém a imagem de perfil de um artista' },
    })
    .get('/api/audio/proxy', ({ request }) => forwardLegacyRequest(request), {
      query: proxyQuerySchema,
      detail: { tags: ['Audio'], summary: 'Transmite um stream de áudio permitido' },
    })
    .post(
      '/api/music/youtube',
      ({ body, request }) => forwardValidatedJsonRequest(request, body, forwardLegacyRequest),
      {
        body: t.Object({
          url: t.String({ pattern: youtubeUrlPattern, maxLength: 2_048 }),
        }),
        detail: { tags: ['Music'], summary: 'Importa uma faixa por URL do YouTube' },
      }
    )
    .post(
      '/api/music/resolve',
      ({ body, request, set }) => {
        if (!isKnownResolveRequest(body)) {
          set.status = 422;
          return {
            success: false,
            error: {
              code: 'VALIDATION_FAILED',
              message: 'title or spotifyId is required',
            },
          };
        }
        return forwardValidatedJsonRequest(request, body, forwardLegacyRequest);
      },
      {
        body: resolveRequestSchema,
        detail: { tags: ['Music'], summary: 'Resolve metadados e stream de uma faixa' },
      }
    );
