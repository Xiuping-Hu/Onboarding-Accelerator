import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookie } from '../../../../../server/auth';
import {
  completeMicrosoftAuthorization,
  getMicrosoftLoginStateCookieName,
  loginWithMicrosoftIdentity,
  microsoftLoginStateCookiePath,
} from '../../../../../server/microsoftAuthService';
import { getClientIp } from '../../../../../server/rateLimit';
import { getServerServices } from '../../../../../server/services';

export async function GET(request: NextRequest): Promise<Response> {
  const services = getServerServices();
  const stateCookieName = getMicrosoftLoginStateCookieName(services.config);

  try {
    const authorization = await completeMicrosoftAuthorization(
      request.nextUrl,
      request.cookies.get(stateCookieName)?.value,
      services.config,
    );
    const login = await loginWithMicrosoftIdentity(
      authorization.identity,
      {
        ipAddress: getClientIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
      },
      services,
    );
    const response = NextResponse.redirect(new URL(authorization.returnTo, request.url));
    setAuthCookie(response, services.config, login.token, login.expiresAt);
    clearMicrosoftLoginCookie(response, stateCookieName, services.config.authSecureCookie);
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL('/login?error=microsoft_sign_in_failed', request.url),
    );
    clearMicrosoftLoginCookie(response, stateCookieName, services.config.authSecureCookie);
    return response;
  }
}

function clearMicrosoftLoginCookie(response: NextResponse, name: string, secure: boolean): void {
  response.cookies.set({
    name,
    value: '',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: microsoftLoginStateCookiePath,
    expires: new Date(0),
    maxAge: 0,
  });
}
