import type { AskResponse } from '@onboarding/shared';
import { z } from 'zod';

export const AskBodySchema = z.object({
  question: z.string().min(1),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
});

export type AskBody = z.infer<typeof AskBodySchema>;

export function toAskResponseDto(response: AskResponse): AskResponse {
  return response;
}
