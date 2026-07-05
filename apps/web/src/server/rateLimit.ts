import type { NextRequest } from 'next/server';

const buckets = new Map<string, { count: number; resetAt: number }>();

export class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests');
    this.name = 'RateLimitError';
  }
}

export function checkRateLimit(input: {
  request: NextRequest;
  userId?: string;
  windowMs: number;
  max: number;
}): void {
  const now = Date.now();
  const key = `${getClientIp(input.request)}:${input.userId ?? 'anonymous'}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + input.windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > input.max) {
    throw new RateLimitError(Math.ceil((bucket.resetAt - now) / 1000));
  }
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}
