import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { AuthError, ForbiddenError, authenticateRequest, type AuthenticatedUser } from './auth';
import { GuideNodeNotFoundError } from './guideService';
import { RateLimitError, checkRateLimit } from './rateLimit';
import { getServerServices } from './services';
import { SessionNotFoundError } from './sessionRepository';

type HandlerContext = {
  request: NextRequest;
  requestId: string;
  user: AuthenticatedUser;
  services: ReturnType<typeof getServerServices>;
};

export async function handleApiRoute(
  request: NextRequest,
  handler: (context: HandlerContext) => Promise<Response | object | void>,
): Promise<Response> {
  const services = getServerServices();
  const requestId = request.headers.get('x-request-id')?.trim() || randomUUID();
  const startedAt = Date.now();
  let user: AuthenticatedUser | undefined;
  let response: Response;

  services.metrics.requestsTotal += 1;

  try {
    user = await authenticateRequest(request, services.config);
    checkRateLimit({
      request,
      userId: user.id,
      windowMs: services.config.rateLimitWindowMs,
      max: services.config.rateLimitMax,
    });

    const result = await handler({ request, requestId, services, user });
    response =
      result instanceof Response
        ? result
        : result === undefined
          ? new Response(null, { status: 204 })
          : NextResponse.json(result);
  } catch (error) {
    response = await toErrorResponse(error, request, requestId, user);
  }

  response.headers.set('x-request-id', requestId);
  services.metrics.responsesTotal += 1;
  await services.logs.recordRequest({
    requestId,
    method: request.method,
    path: request.nextUrl.pathname,
    statusCode: response.status,
    durationMs: Date.now() - startedAt,
    userId: user?.id,
  });
  return response;
}

export function publicJson(payload: object): Response {
  return NextResponse.json(payload);
}

async function toErrorResponse(
  error: unknown,
  request: NextRequest,
  requestId: string,
  user?: AuthenticatedUser,
): Promise<Response> {
  const services = getServerServices();

  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message, requestId }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message, requestId }, { status: 403 });
  }

  if (error instanceof RateLimitError) {
    const response = NextResponse.json({ error: error.message, requestId }, { status: 429 });
    response.headers.set('Retry-After', String(error.retryAfterSeconds));
    return response;
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        requestId,
        ...(services.config.nodeEnv === 'production' ? {} : { details: error.flatten() }),
      },
      { status: 400 },
    );
  }

  if (error instanceof SessionNotFoundError || error instanceof GuideNodeNotFoundError) {
    return NextResponse.json({ error: error.message, requestId }, { status: 404 });
  }

  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      path: request.nextUrl.pathname,
      method: request.method,
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  await services.logs.recordError({
    requestId,
    method: request.method,
    path: request.nextUrl.pathname,
    message: error instanceof Error ? error.message : 'Unknown error',
    userId: user?.id,
  });
  return NextResponse.json({ error: 'Unexpected server error', requestId }, { status: 500 });
}
