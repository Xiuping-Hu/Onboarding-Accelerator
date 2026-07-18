import type { LogEventsResponse, LogSummaryResponse } from '@onboarding/shared';
import { z } from 'zod';

export const RecentLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function toLogEventsResponseDto(response: LogEventsResponse): LogEventsResponse {
  return response;
}

export function toLogSummaryResponseDto(response: LogSummaryResponse): LogSummaryResponse {
  return response;
}
