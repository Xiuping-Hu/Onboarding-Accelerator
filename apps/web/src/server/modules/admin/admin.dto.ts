import type {
  AdminActivityQuery,
  AdminActivityResponse,
  AdminAuditResponse,
  AiFeeAdjustmentsResponse,
  AiFeeSummaryResponse,
  AiRateCardsResponse,
} from '@onboarding/shared';
import { z } from 'zod';

export const ActivityQuerySchema = z.object({
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

export const EventIdParamsSchema = z.object({ eventId: z.string().min(1) });
export const RateIdParamsSchema = z.object({ rateId: z.string().min(1) });
export const AuditLimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const ActivityDeleteBodySchema = z.object({
  query: ActivityQuerySchema,
  reason: z.string().trim().min(3).max(500),
});
export const ActivityExportBodySchema = z.object({
  query: ActivityQuerySchema.optional(),
  format: z.enum(['csv', 'jsonl']).default('csv'),
});
export const RetentionBodySchema = z.object({
  retentionDays: z.number().int().min(1).max(3650),
  reason: z.string().trim().min(3).max(500),
});
export const AdjustmentBodySchema = z.object({
  usageEventId: z.string().trim().min(1).optional(),
  amount: z.number(),
  currency: z.string().trim().min(3).max(3).optional(),
  reason: z.string().trim().min(3).max(500),
});
export const LimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const RateBodySchema = z.object({
  provider: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(120),
  currency: z.string().trim().min(3).max(3).optional(),
  inputCostPer1MTokens: z.number().min(0),
  outputCostPer1MTokens: z.number().min(0),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});
export const RatePatchBodySchema = RateBodySchema.partial();
export const RecalculateBodySchema = z.object({
  query: ActivityQuerySchema.optional(),
  reason: z.string().trim().min(3).max(500),
});

export type ActivityQueryDto = z.infer<typeof ActivityQuerySchema>;
export type ActivityDeleteBody = z.infer<typeof ActivityDeleteBodySchema>;
export type ActivityExportBody = z.infer<typeof ActivityExportBodySchema>;
export type RetentionBody = z.infer<typeof RetentionBodySchema>;
export type AdjustmentBody = z.infer<typeof AdjustmentBodySchema>;
export type RateBody = z.infer<typeof RateBodySchema>;
export type RatePatchBody = z.infer<typeof RatePatchBodySchema>;
export type RecalculateBody = z.infer<typeof RecalculateBodySchema>;

export function toAdminActivityQuery(input: ActivityQueryDto): AdminActivityQuery {
  return input;
}
export function toAdminActivityResponseDto(input: AdminActivityResponse): AdminActivityResponse {
  return input;
}
export function toAdminAuditResponseDto(input: AdminAuditResponse): AdminAuditResponse {
  return input;
}
export function toAiFeeSummaryResponseDto(input: AiFeeSummaryResponse): AiFeeSummaryResponse {
  return input;
}
export function toAiRateCardsResponseDto(input: AiRateCardsResponse): AiRateCardsResponse {
  return input;
}
export function toAiAdjustmentsResponseDto(
  input: AiFeeAdjustmentsResponse,
): AiFeeAdjustmentsResponse {
  return input;
}
