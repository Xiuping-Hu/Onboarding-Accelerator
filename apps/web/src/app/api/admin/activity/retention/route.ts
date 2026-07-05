import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleAdminApiRoute } from '../../../../../server/adminApi';

const retentionSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = retentionSchema.parse(await apiRequest.json());
    await services.adminAudit.record({
      actorUserId: user.id,
      action: 'activity.retention.update',
      targetType: 'activity_log',
      metadata: {
        retentionDays: payload.retentionDays,
        reason: payload.reason,
      },
      ipAddress: apiRequest.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: apiRequest.headers.get('user-agent') ?? undefined,
    });
    return { retentionDays: payload.retentionDays };
  });
}
