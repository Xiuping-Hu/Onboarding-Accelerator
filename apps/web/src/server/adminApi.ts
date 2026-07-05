import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { AdminActivityQuery } from '@onboarding/shared';
import { requireAdminUser } from './auth';
import { handleApiRoute } from './routeHandler';

export function handleAdminApiRoute(
  request: NextRequest,
  handler: Parameters<typeof handleApiRoute>[1],
): Promise<Response> {
  return handleApiRoute(request, async (context) => {
    requireAdminUser(context.user);
    return handler(context);
  });
}

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  eventType: z.enum(['request', 'ai_usage', 'error']).optional(),
  userId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  requestId: z.string().trim().min(1).optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional(),
  operation: z.enum(['ask', 'chat']).optional(),
  model: z.string().trim().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export function parseActivityQuery(request: NextRequest): AdminActivityQuery {
  return activityQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
}

export function parseActivityQueryBody(payload: unknown): AdminActivityQuery {
  return activityQuerySchema.parse(payload);
}

export function csvResponse(content: string, filename: string): Response {
  return new Response(content, {
    headers: {
      'content-disposition': `attachment; filename="${filename}"`,
      'content-type': 'text/csv; charset=utf-8',
    },
  });
}

export function jsonlResponse(content: string, filename: string): Response {
  return new Response(content, {
    headers: {
      'content-disposition': `attachment; filename="${filename}"`,
      'content-type': 'application/x-ndjson; charset=utf-8',
    },
  });
}

export function noStoreJson(payload: object, status = 200): Response {
  const response = NextResponse.json(payload, { status });
  response.headers.set('cache-control', 'no-store');
  return response;
}
