import { Router } from 'express';
import { z } from 'zod';
import type { HealthResponse } from '@onboarding/shared';
import { answerQuestion } from './agent.js';

const askRequestSchema = z.object({
  question: z.string().min(1),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
});

export function createRoutes(): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    const payload: HealthResponse = { status: 'ok', service: 'onboarding-server' };
    response.json(payload);
  });

  router.post('/api/ask', async (request, response, next) => {
    try {
      const payload = askRequestSchema.parse(request.body);
      response.json(await answerQuestion(payload));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
