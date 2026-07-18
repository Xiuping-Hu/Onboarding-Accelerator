import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { AuthError, ForbiddenError, authenticateRequest, requireAdminUser } from '../../auth';
import type { AuthenticatedUser } from '../../auth';
import type { AppContainer, AppControllers } from '../../bootstrap/appContainer';
import { getAppContainer } from '../../bootstrap/appContainer';
import { KnowledgeMapNotFoundError, KnowledgeMapValidationError } from '../../knowledgeMapService';
import { RateLimitError, checkRateLimit } from '../../rateLimit';
import { SessionNotFoundError } from '../../sessionRepository';
import { AppError } from '../errors/appError';
import type { Controller } from './controller';
import type { HttpResult } from './httpResult';

export type RouteAccess = 'public' | 'optional' | 'authenticated' | 'admin';

export interface RouteHandlerOptions {
  rateLimit?: boolean;
  logRequest?: boolean;
}

interface NextRouteContext {
  params: Promise<Record<string, string>>;
}

export interface AppRouteHandler {
  (request: NextRequest): Promise<Response>;
  (request: NextRequest, routeContext: NextRouteContext): Promise<Response>;
}

export function createRouteHandler(
  access: RouteAccess,
  selectController: (controllers: AppControllers) => Controller,
  options: RouteHandlerOptions = {},
): AppRouteHandler {
  const handler = async (
    request: NextRequest,
    routeContext?: NextRouteContext,
  ): Promise<Response> => {
    const container = getAppContainer();
    const requestId = request.headers.get('x-request-id')?.trim() || randomUUID();
    const startedAt = Date.now();
    let user: AuthenticatedUser | undefined;
    let response: Response;
    container.metrics.requestsTotal += 1;

    try {
      if (access === 'optional') {
        try {
          user = await authenticateRequest(request, container);
        } catch (error) {
          if (!(error instanceof AuthError)) throw error;
        }
      } else if (access !== 'public') {
        user = await authenticateRequest(request, container);
        if (access === 'admin') requireAdminUser(user);
      }

      if ((options.rateLimit ?? access !== 'public') && user) {
        checkRateLimit({
          request,
          userId: user.id,
          windowMs: container.config.rateLimitWindowMs,
          max: container.config.rateLimitMax,
        });
      }

      const result = await selectController(container.controllers)({
        request,
        params: routeContext ? await routeContext.params : {},
        requestId,
        user,
      });
      response = toResponse(result);
    } catch (error) {
      response = await toErrorResponse(error, request, requestId, container, user?.id);
    }

    response.headers.set('x-request-id', requestId);
    container.metrics.responsesTotal += 1;
    if (options.logRequest ?? true) {
      await safelyRecord(() =>
        container.logs.recordRequest({
          requestId,
          method: request.method,
          path: request.nextUrl.pathname,
          statusCode: response.status,
          durationMs: Date.now() - startedAt,
          userId: user?.id,
        }),
      );
    }
    return response;
  };
  return handler as AppRouteHandler;
}

function toResponse(result: HttpResult): NextResponse {
  let response: NextResponse;
  if (result.kind === 'json') {
    response = NextResponse.json(result.body, { status: result.status, headers: result.headers });
  } else if (result.kind === 'text') {
    response = new NextResponse(result.body, { status: result.status, headers: result.headers });
  } else if (result.kind === 'redirect') {
    response = new NextResponse(null, {
      status: result.status,
      headers: { ...result.headers, location: result.location },
    });
  } else {
    response = new NextResponse(null, { status: result.status, headers: result.headers });
  }

  for (const cookie of result.cookies ?? []) response.cookies.set(cookie);
  return response;
}

async function toErrorResponse(
  error: unknown,
  request: NextRequest,
  requestId: string,
  container: AppContainer,
  userId?: string,
): Promise<Response> {
  if (error instanceof AuthError) return jsonError(error.message, requestId, 401);
  if (error instanceof ForbiddenError) return jsonError(error.message, requestId, 403);
  if (error instanceof RateLimitError) {
    const response = jsonError(error.message, requestId, 429);
    response.headers.set('Retry-After', String(error.retryAfterSeconds));
    return response;
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        requestId,
        ...(container.config.nodeEnv === 'production' ? {} : { details: error.flatten() }),
      },
      { status: 400 },
    );
  }
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        requestId,
        ...(container.config.nodeEnv === 'production' || !error.details
          ? {}
          : { details: error.details }),
      },
      { status: error.status },
    );
  }
  if (error instanceof SessionNotFoundError || error instanceof KnowledgeMapNotFoundError) {
    return jsonError(error.message, requestId, 404);
  }
  if (error instanceof KnowledgeMapValidationError) {
    return jsonError(error.message, requestId, 400);
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
  await safelyRecord(() =>
    container.logs.recordError({
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      message: error instanceof Error ? error.message : 'Unknown error',
      userId,
    }),
  );
  return jsonError('Unexpected server error', requestId, 500);
}

function jsonError(message: string, requestId: string, status: number): NextResponse {
  return NextResponse.json({ error: message, requestId }, { status });
}

async function safelyRecord(record: () => Promise<void>): Promise<void> {
  try {
    await record();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Failed to persist application log',
        cause: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}
