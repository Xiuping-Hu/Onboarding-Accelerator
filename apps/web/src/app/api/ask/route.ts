import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { answerQuestion } from '@/server/agent';
import { handleApiRoute } from '@/server/routeHandler';

const askRequestSchema = z.object({
  question: z.string().min(1),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = askRequestSchema.parse(await apiRequest.json());
    return answerQuestion(payload, services.rag, services.openAi, services.logs, user.id);
  });
}
