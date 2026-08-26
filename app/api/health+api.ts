export function GET(): Response {
  return Response.json({
    status: 'ok',
    service: 'openfy-api-routes',
    time: new Date().toISOString(),
  });
}
