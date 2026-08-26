import type { Server } from 'node:http';

export function handleNodeServerRequest(
  server: Server,
  request: Request
): Promise<Response>;
