import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleAdminApiRoute } from '../../../../../server/adminApi';

const adjustmentSchema = z.object({
  usageEventId: z.string().trim().min(1).optional(),
  amount: z.number(),
  currency: z.string().trim().min(3).max(3).optional(),
  reason: z.string().trim().min(3).max(500),
});

const limitSchema = z.coerce.number().int().min(1).max(100).optional();

export async function GET(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services }) =>
    services.aiAdjustments.listRecent(
      limitSchema.parse(apiRequest.nextUrl.searchParams.get('limit') ?? undefined),
    ),
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = adjustmentSchema.parse(await apiRequest.json());
    const adjustment = await services.aiAdjustments.create(payload, user);
    await services.adminAudit.record({
      actorUserId: user.id,
      action: 'ai_fee_adjustment.create',
      targetType: 'ai_fee_adjustment',
      targetId: adjustment.id,
      metadata: {
        amount: adjustment.amount,
        currency: adjustment.currency,
        reason: adjustment.reason,
      },
      ipAddress: apiRequest.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: apiRequest.headers.get('user-agent') ?? undefined,
    });
    return { adjustment };
  });
}
