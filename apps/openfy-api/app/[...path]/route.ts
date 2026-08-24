import { createApiApp } from '../../src/app';
import { forwardLegacyRequest } from '../../src/legacyGateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const api = createApiApp({ forwardLegacyRequest });

const handle = (request: Request) => api.handle(request);

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
