import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { HealthResponse } from '@onboarding/shared';
import { answerQuestion } from './agent.js';
import type { ChatOrchestrationService } from './chatService.js';
import { GuideNodeNotFoundError, type GuideOrchestrationService } from './guideService.js';
import { SessionNotFoundError, type SessionRepository } from './sessionRepository.js';

const userSettingsSchema = z.object({
  webSearchEnabled: z.boolean().optional(),
});

const createSessionRequestSchema = z.object({
  title: z.string().optional(),
  settings: userSettingsSchema.optional(),
});

const updateSessionRequestSchema = z.object({
  title: z.string().optional(),
  settings: userSettingsSchema.optional(),
  selectedNodeId: z.string().nullable().optional(),
  expandedNodeIds: z.array(z.string()).optional(),
});

const chatRequestSchema = z.object({
  message: z.string().min(1),
  webSearchEnabled: z.boolean().optional(),
});

const guideRootRequestSchema = z.object({
  prompt: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
});

const guideExpandRequestSchema = z.object({
  nodeId: z.string().min(1),
  instruction: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
});

const askRequestSchema = z.object({
  question: z.string().min(1),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
});

export interface RouteDependencies {
  sessions: SessionRepository;
  chat: ChatOrchestrationService;
  guide: GuideOrchestrationService;
}

export function createRoutes(dependencies: RouteDependencies): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    const payload: HealthResponse = { status: 'ok', service: 'onboarding-server' };
    response.json(payload);
  });

  router.get('/api/sessions', async (_request, response, next) => {
    try {
      response.json({ sessions: await dependencies.sessions.list() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/sessions', async (request, response, next) => {
    try {
      const payload = createSessionRequestSchema.parse(request.body);
      response.status(201).json(await dependencies.sessions.create(payload));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/sessions/:sessionId', async (request, response, next) => {
    try {
      response.json(await dependencies.sessions.get(request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/api/sessions/:sessionId', async (request, response, next) => {
    try {
      const payload = updateSessionRequestSchema.parse(request.body);
      response.json(await dependencies.sessions.update(request.params.sessionId, payload));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/api/sessions/:sessionId', async (request, response, next) => {
    try {
      await dependencies.sessions.delete(request.params.sessionId);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/sessions/:sessionId/chat', async (request, response, next) => {
    try {
      const payload = chatRequestSchema.parse(request.body);
      response.json(await dependencies.chat.chat(request.params.sessionId, payload));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/sessions/:sessionId/guide/root', async (request, response, next) => {
    try {
      const payload = guideRootRequestSchema.parse(request.body);
      response.json(await dependencies.guide.generateRoot(request.params.sessionId, payload));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/sessions/:sessionId/guide/expand', async (request, response, next) => {
    try {
      const payload = guideExpandRequestSchema.parse(request.body);
      response.json(await dependencies.guide.expand(request.params.sessionId, payload));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/ask', async (request, response, next) => {
    try {
      const payload = askRequestSchema.parse(request.body);
      response.json(await answerQuestion(payload));
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof SessionNotFoundError || error instanceof GuideNodeNotFoundError) {
      response.status(404).json({ error: error.message });
      return;
    }

    next(error);
  });

  return router;
}
