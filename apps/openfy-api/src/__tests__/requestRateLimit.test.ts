import { describe, expect, it } from 'bun:test';

import { createRequestRateLimiter } from '../requestRateLimit';

describe('request rate limiter', () => {
  it('limits music resolution per client while preserving another client', () => {
    const limitRequest = createRequestRateLimiter(() => 1_000);
    const request = new Request('https://api.openfy.app/api/music/resolve', {
      headers: { 'x-real-ip': '192.0.2.1' },
    });

    for (let index = 0; index < 20; index += 1) {
      expect(limitRequest(request).allowed).toBe(true);
    }

    expect(limitRequest(request)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(
      limitRequest(
        new Request('https://api.openfy.app/api/music/resolve', {
          headers: { 'x-real-ip': '192.0.2.2' },
        })
      ).allowed
    ).toBe(true);
  });
});
