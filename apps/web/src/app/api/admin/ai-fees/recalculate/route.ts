import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleAdminApiRoute, parseActivityQueryBody } from '../../../../../server/adminApi';

const recalculateSchema = z.object({
  query: z.unknown().optional(),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = recalculateSchema.parse(await apiRequest.json());
    const query = parseActivityQueryBody(payload.query ?? {});
    const summary = await services.aiFees.summarize(query);
    await services.adminAudit.record({
      actorUserId: user.id,
      action: 'ai_fees.recalculate',
      targetType: 'ai_fee_summary',
      metadata: {
        requests: summary.requests,
        estimatedFee: summary.estimatedFee,
        reason: payload.reason,
      },
      ipAddress: apiRequest.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: apiRequest.headers.get('user-agent') ?? undefined,
    });
    return summary;
  });
}
