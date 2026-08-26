type RateLimitRule = {
  limit: number;
  windowMs: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

export type RequestRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const MAX_TRACKED_CLIENTS = 10_000;
const STANDARD_RULE: RateLimitRule = { limit: 60, windowMs: 60_000 };
const MUSIC_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };
const AUDIO_RULE: RateLimitRule = { limit: 240, windowMs: 60_000 };

const getRule = (pathname: string): RateLimitRule => {
  if (pathname === '/api/audio/proxy' || pathname === '/api/audio/youtube') {
    return AUDIO_RULE;
  }
  if (pathname.startsWith('/api/music/') || pathname.startsWith('/api/spotify/')) {
    return MUSIC_RULE;
  }
  return STANDARD_RULE;
};

const getClientKey = (request: Request) => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = request.headers.get('x-real-ip') || forwardedFor?.split(',')[0]?.trim();
  return clientIp || 'anonymous';
};

/** Process-local guard. Configure Vercel WAF as the shared production limit. */
export const createRequestRateLimiter = (now = () => Date.now()) => {
  const clients = new Map<string, RateLimitState>();

  return (request: Request): RequestRateLimitResult => {
    const pathname = new URL(request.url).pathname;
    const rule = getRule(pathname);
    const key = `${getClientKey(request)}:${pathname}`;
    const currentTime = now();
    const current = clients.get(key);

    if (!current || current.resetAt <= currentTime) {
      if (clients.size >= MAX_TRACKED_CLIENTS) {
        const oldestKey = clients.keys().next().value;
        if (oldestKey) clients.delete(oldestKey);
      }
      clients.set(key, { count: 1, resetAt: currentTime + rule.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.count >= rule.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - currentTime) / 1000)),
      };
    }

    clients.set(key, { ...current, count: current.count + 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  };
};
