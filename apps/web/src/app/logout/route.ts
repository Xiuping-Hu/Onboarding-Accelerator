import { NextResponse, type NextRequest } from 'next/server';
import { AuthError, authenticateRequest, clearAuthCookie } from '../../server/auth';
import { getClientIp } from '../../server/rateLimit';
import { getServerServices } from '../../server/services';
import { hashSessionToken } from '../../server/sessionTokens';

export async function GET(request: NextRequest): Promise<Response> {
  return logoutAndRedirect(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return logoutAndRedirect(request);
}

async function logoutAndRedirect(request: NextRequest): Promise<Response> {
  const services = getServerServices();
  const token = request.cookies.get(services.config.authCookieName)?.value;
  let userId: string | undefined;
  let email: string | undefined;

  try {
    const user = await authenticateRequest(request, services);
    userId = user.id;
    email = user.email;
  } catch (error) {
    if (!(error instanceof AuthError)) {
      throw error;
    }
  }

  if (token && services.authSessions) {
    await services.authSessions.revokeByTokenHash(hashSessionToken(token), new Date());
  }

  await services.loginAudit.record({
    userId,
    email,
    eventType: 'logout',
    success: true,
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  const response = NextResponse.redirect(new URL('/login', request.url));
  clearAuthCookie(response, services.config);
  return response;
}
