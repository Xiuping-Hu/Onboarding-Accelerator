import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseQuery } from '../../core/http/requestParsers';
import { getClientIp } from '../../rateLimit';
import {
  MicrosoftStartQuerySchema,
  toCurrentUserResponseDto,
  toLogoutResponseDto,
} from './auth.dto';
import type { AuthService } from './auth.service';

export function createAuthController(service: AuthService) {
  const me: Controller = (context) => {
    const user = requireControllerUser(context);
    return httpResult.json(toCurrentUserResponseDto(service.currentUser(user)));
  };

  const logout: Controller = async (context) => {
    const token = context.request.cookies.get(service.authCookieName)?.value;
    await service.logout(token, context.user, requestMetadata(context.request));
    return httpResult.withCookies(httpResult.json(toLogoutResponseDto()), [
      service.clearAuthCookie(),
    ]);
  };

  const logoutRedirect: Controller = async (context) => {
    const token = context.request.cookies.get(service.authCookieName)?.value;
    await service.logout(token, context.user, requestMetadata(context.request));
    return httpResult.redirect(new URL('/login', context.request.url).toString(), 307, [
      service.clearAuthCookie(),
    ]);
  };

  const microsoftStart: Controller = async (context) => {
    const { returnTo } = parseQuery(context.request, MicrosoftStartQuerySchema);
    const result = await service.startMicrosoft(returnTo);
    return httpResult.redirect(
      new URL(result.location, context.request.url).toString(),
      307,
      result.stateCookie ? [result.stateCookie] : undefined,
    );
  };

  const microsoftCallback: Controller = async (context) => {
    const stateCookie = context.request.cookies.get(service.microsoftStateCookieName())?.value;
    const result = await service.completeMicrosoft(
      context.request.nextUrl,
      stateCookie,
      requestMetadata(context.request),
    );
    return httpResult.redirect(
      new URL(result.location, context.request.url).toString(),
      307,
      result.cookies,
    );
  };

  return { me, logout, logoutRedirect, microsoftStart, microsoftCallback };
}

function requestMetadata(request: Parameters<typeof getClientIp>[0]) {
  return {
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  };
}
