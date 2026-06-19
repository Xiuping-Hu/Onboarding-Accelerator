import type { NextFunction, Request, Response } from 'express';

export function createRateLimitMiddleware(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${request.ip}:${request.user?.id ?? 'anonymous'}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      response
        .status(429)
        .setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000).toString())
        .json({ error: 'Too many requests' });
      return;
    }

    next();
  };
}
