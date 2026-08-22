import { handleFetchRequest } from '../../server';

export function GET(request: Request): Promise<Response> {
  return handleFetchRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return handleFetchRequest(request);
}

export function OPTIONS(request: Request): Promise<Response> {
  return handleFetchRequest(request);
}
