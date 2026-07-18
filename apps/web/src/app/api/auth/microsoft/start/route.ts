import { NextResponse, type NextRequest } from 'next/server';
import {
  createMicrosoftAuthorizationRequest,
  getMicrosoftLoginStateCookieName,
  microsoftLoginStateCookiePath,
  microsoftLoginStateMaxAgeSeconds,
  sanitizeReturnTo,
} from '../../../../../server/microsoftAuthService';
import { getServerServices } from '../../../../../server/services';

export async function GET(request: NextRequest): Promise<Response> {
  const services = getServerServices();
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo') ?? undefined);

  if (services.config.authDisabled) {
    return NextResponse.redirect(new URL(returnTo, request.url));
  }

  const authorization = await createMicrosoftAuthorizationRequest(services.config, returnTo);
  const response = NextResponse.redirect(authorization.url);
  response.cookies.set({
    name: getMicrosoftLoginStateCookieName(services.config),
    value: authorization.cookieValue,
    httpOnly: true,
    secure: services.config.authSecureCookie,
    sameSite: 'lax',
    path: microsoftLoginStateCookiePath,
    expires: authorization.expiresAt,
    maxAge: microsoftLoginStateMaxAgeSeconds,
  });
  return response;
}
