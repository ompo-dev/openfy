import type { EventEmitter } from 'node:events';

type NodeResponse = {
  readonly destroyed: boolean;
  readonly headersSent: boolean;
  readonly writableEnded: boolean;
  end: (chunk?: Buffer | string) => void;
  setHeader: (name: string, value: string | number | readonly string[]) => void;
  write: (chunk?: Buffer | string) => void;
  writeHead: (
    status: number,
    headers?: Record<string, string | number | readonly string[] | undefined>
  ) => void;
};

type NodeRequest = {
  headers: Record<string, string>;
  method: string;
  on: (event: 'data' | 'end', listener: (chunk?: Buffer) => void) => NodeRequest;
  url: string;
};

type LegacyHttpServer = Pick<EventEmitter, 'emit'>;

const toChunk = (value: Buffer | string): Uint8Array<ArrayBuffer> =>
  typeof value === 'string' ? Uint8Array.from(Buffer.from(value)) : Uint8Array.from(value);

/** Bridges a standard Request to the existing Node resolver without buffering audio. */
export const handleNodeServerRequest = async (
  server: LegacyHttpServer,
  request: Request
): Promise<Response> => {
  const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
  const requestUrl = new URL(request.url);

  return new Promise<Response>((resolve, reject) => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let destroyed = false;
    let ended = false;
    let headersSent = false;
    let responseStarted = false;
    let status = 200;
    const headers = new Headers();
    const listeners = new Map<'data' | 'end', (chunk?: Buffer) => void>();

    const stream = new ReadableStream<Uint8Array>({
      start(nextController) {
        controller = nextController;
      },
      cancel() {
        destroyed = true;
      },
    });

    const beginResponse = () => {
      if (responseStarted) return;
      responseStarted = true;
      resolve(new Response(stream, { headers, status }));
    };

    const incoming: NodeRequest = {
      method: request.method,
      url: `${requestUrl.pathname}${requestUrl.search}`,
      headers: Object.fromEntries(request.headers.entries()),
      on(event, listener) {
        listeners.set(event, listener);
        return incoming;
      },
    };

    const outgoing: NodeResponse = {
      get destroyed() {
        return destroyed;
      },
      get headersSent() {
        return headersSent;
      },
      get writableEnded() {
        return ended;
      },
      setHeader(name, value) {
        headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
      },
      writeHead(nextStatus, nextHeaders = {}) {
        status = nextStatus;
        headersSent = true;
        for (const [name, value] of Object.entries(nextHeaders)) {
          if (value !== undefined) {
            headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
          }
        }
        beginResponse();
      },
      write(chunk) {
        if (ended || destroyed || chunk === undefined) return;
        headersSent = true;
        beginResponse();
        controller?.enqueue(toChunk(chunk));
      },
      end(chunk) {
        if (ended) return;
        if (chunk !== undefined) outgoing.write(chunk);
        ended = true;
        beginResponse();
        controller?.close();
      },
    };

    try {
      server.emit('request', incoming, outgoing);
      queueMicrotask(() => {
        if (body) listeners.get('data')?.(Buffer.from(body));
        listeners.get('end')?.();
      });
    } catch (error) {
      reject(error);
    }
  });
};
