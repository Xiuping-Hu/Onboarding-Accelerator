import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { LoginResponse } from '@onboarding/shared';
import { LoginFailedError, loginWithPassword } from '../../../../server/accountAuthService';
import { setAuthCookie } from '../../../../server/auth';
import { checkRateLimit, getClientIp, RateLimitError } from '../../../../server/rateLimit';
import { getServerServices } from '../../../../server/services';
import { normalizeEmail } from '../../../../server/userRepository';

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
});

export async function POST(request: NextRequest): Promise<Response> {
  const services = getServerServices();

  try {
    const payload = loginSchema.parse(await request.json());
    const normalizedEmail = normalizeEmail(payload.email);

    checkRateLimit({
      request,
      windowMs: services.config.authLoginRateLimitWindowMs,
      max: services.config.authLoginRateLimitMax,
    });
    checkRateLimit({
      request,
      userId: `login:${normalizedEmail}`,
      windowMs: services.config.authLoginRateLimitWindowMs,
      max: services.config.authLoginRateLimitMax,
    });

    const result = await loginWithPassword(
      {
        email: normalizedEmail,
        password: payload.password,
        ipAddress: getClientIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
      },
      services,
    );
    const response = NextResponse.json<LoginResponse>({
      user: result.user,
      expiresAt: result.expiresAt.toISOString(),
    });
    setAuthCookie(response, services.config, result.token, result.expiresAt);

    return response;
  } catch (error) {
    if (error instanceof LoginFailedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof RateLimitError) {
      const response = NextResponse.json({ error: error.message }, { status: 429 });
      response.headers.set('Retry-After', String(error.retryAfterSeconds));
      return response;
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid login request' }, { status: 400 });
    }

    throw error;
  }
}
