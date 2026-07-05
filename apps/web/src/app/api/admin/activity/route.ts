import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  handleAdminApiRoute,
  parseActivityQuery,
  parseActivityQueryBody,
} from '../../../../server/adminApi';

const deleteSchema = z.object({
  query: z.unknown(),
  reason: z.string().trim().min(3).max(500),
});

export async function GET(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services }) =>
    services.adminActivity.query(parseActivityQuery(apiRequest)),
  );
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = deleteSchema.parse(await apiRequest.json());
    const query = parseActivityQueryBody(payload.query);
    const result = await services.adminActivity.delete(query);
    await services.adminAudit.record({
      actorUserId: user.id,
      action: 'activity.delete',
      targetType: 'activity_log',
      metadata: {
        deletedCount: result.deletedCount,
        reason: payload.reason,
      },
      ipAddress: apiRequest.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: apiRequest.headers.get('user-agent') ?? undefined,
    });
    return result;
  });
}
