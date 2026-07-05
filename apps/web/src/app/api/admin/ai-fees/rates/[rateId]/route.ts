import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleAdminApiRoute } from '../../../../../../server/adminApi';

type RouteContext = {
  params: Promise<{ rateId: string }>;
};

const ratePatchSchema = z.object({
  provider: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  inputCostPer1MTokens: z.number().min(0).optional(),
  outputCostPer1MTokens: z.number().min(0).optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { rateId } = await context.params;
  return handleAdminApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = ratePatchSchema.parse(await apiRequest.json());
    const rateCard = await services.aiRates.update(rateId, payload, user);
    await services.adminAudit.record({
      actorUserId: user.id,
      action: 'ai_rate_card.update',
      targetType: 'ai_rate_card',
      targetId: rateCard.id,
      metadata: {
        model: rateCard.model,
        isActive: rateCard.isActive,
      },
      ipAddress: apiRequest.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: apiRequest.headers.get('user-agent') ?? undefined,
    });
    return { rateCard };
  });
}
