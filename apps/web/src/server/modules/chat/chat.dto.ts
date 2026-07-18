import type { ChatResponse } from '@onboarding/shared';
import { z } from 'zod';

export const ChatParamsSchema = z.object({ sessionId: z.string().min(1) });

export const ChatBodySchema = z.object({
  message: z.string().min(1),
  webSearchEnabled: z.boolean().optional(),
  referencedNodeId: z.string().optional(),
});

export function toChatResponseDto(response: ChatResponse): ChatResponse {
  return response;
}
