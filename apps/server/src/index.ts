import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { createAuthMiddleware } from './auth.js';
import { ChatOrchestrationService } from './chatService.js';
import { loadConfig } from './config.js';
import { GuideOrchestrationService } from './guideService.js';
import { OpenAiService } from './openAiService.js';
import { createRateLimitMiddleware } from './rateLimit.js';
import { createConfiguredRagInputAdapters } from './ragAdapters/index.js';
import { RagService } from './ragService.js';
import { createRoutes } from './routes.js';
import { FileSessionRepository } from './sessionRepository.js';
import { DisabledWebSearchProvider } from './webSearchProvider.js';

const config = loadConfig();
const app = express();
const sessions = new FileSessionRepository(config.sessionStorePath);
const openAi = new OpenAiService({
  apiKey: config.openAiApiKey,
  model: config.openAiModel,
  timeoutMs: config.openAiTimeoutMs,
  maxRetries: config.openAiMaxRetries,
});
const rag = new RagService(
  new DisabledWebSearchProvider(config.webSearchAllowed),
  createConfiguredRagInputAdapters(config),
);
const chat = new ChatOrchestrationService(sessions, rag, openAi);
const guide = new GuideOrchestrationService(sessions, rag, config.guideMaxDepth);
const metrics = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  responsesTotal: 0,
};

app.disable('x-powered-by');
app.use(assignRequestId);
app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        config.corsOrigins.includes(origin) ||
        (config.nodeEnv !== 'production' && config.corsOrigins.length === 0)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin denied'));
    },
  }),
);
app.use(express.json({ limit: config.requestBodyLimit }));
app.use(createAuthMiddleware(config));
app.use(createRateLimitMiddleware({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax }));
app.use((_request, response, next) => {
  metrics.requestsTotal += 1;
  response.on('finish', () => {
    metrics.responsesTotal += 1;
  });
  next();
});
app.get('/metrics', (_request, response) => {
  response.json(metrics);
});
app.use(createRoutes({ sessions, chat, guide, openAi, rag }));

app.get('/ready', (_request, response) => {
  response.json({ status: 'ok', service: 'onboarding-server' });
});

app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: 'Invalid request',
      requestId: response.locals.requestId,
      ...(config.nodeEnv === 'production' ? {} : { details: error.flatten() }),
    });
    return;
  }

  console.error(
    JSON.stringify({
      level: 'error',
      requestId: response.locals.requestId,
      path: request.path,
      method: request.method,
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  response
    .status(500)
    .json({ error: 'Unexpected server error', requestId: response.locals.requestId });
});

const server = app.listen(config.port, () => {
  console.info(`Onboarding server listening on http://localhost:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      console.info(`Onboarding server stopped after ${signal}`);
      process.exit(0);
    });
  });
}

function assignRequestId(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction,
): void {
  const incomingRequestId = request.header('x-request-id');
  const requestId =
    typeof incomingRequestId === 'string' && incomingRequestId.trim()
      ? incomingRequestId
      : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
