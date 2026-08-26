const handleNodeServerRequest = async (server, request) => {
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? ''
      : await request.text();
  const requestUrl = new URL(request.url);

  return new Promise((resolve, reject) => {
    try {
      const incoming = {
        method: request.method,
        url: `${requestUrl.pathname}${requestUrl.search}`,
        headers: Object.fromEntries(request.headers.entries()),
        listeners: new Map(),
        on(event, listener) {
          this.listeners.set(event, listener);
          return this;
        },
      };
      const responseHeaders = new Headers();
      const chunks = [];
      let status = 200;
      let ended = false;
      let headersSent = false;
      const finish = (chunk) => {
        if (ended) return;
        ended = true;
        headersSent = true;
        if (chunk !== undefined) chunks.push(Buffer.from(chunk));
        resolve(
          new Response(chunks.length ? Buffer.concat(chunks) : null, {
            status,
            headers: responseHeaders,
          })
        );
      };
      const outgoing = {
        get headersSent() {
          return headersSent;
        },
        get destroyed() {
          return false;
        },
        get writableEnded() {
          return ended;
        },
        setHeader(name, value) {
          responseHeaders.set(name, String(value));
        },
        writeHead(nextStatus, headers = {}) {
          status = nextStatus;
          headersSent = true;
          for (const [name, value] of Object.entries(headers)) {
            if (value !== undefined) responseHeaders.set(name, String(value));
          }
        },
        write(chunk) {
          headersSent = true;
          if (chunk !== undefined) chunks.push(Buffer.from(chunk));
        },
        end: finish,
      };

      server.emit('request', incoming, outgoing);
      queueMicrotask(() => {
        if (body) incoming.listeners.get('data')?.(Buffer.from(body));
        incoming.listeners.get('end')?.();
      });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { handleNodeServerRequest };
