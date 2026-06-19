import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import type { CreateSessionResponse, SourceProvenance } from '@onboarding/shared';
import { createAuthMiddleware } from './auth.js';
import { createRoutes } from './routes.js';
import type { ChatOrchestrationService } from './chatService.js';
import type { GuideOrchestrationService } from './guideService.js';
import type { OpenAiService } from './openAiService.js';
import type { RagService, RetrievalContext, RetrievalOptions } from './ragService.js';
import { InMemorySessionRepository } from './sessionRepository.js';
import type { ServerConfig } from './config.js';

void test('/api/sessions wraps created session in response contract', async () => {
  const app = express();
  const sessions = new InMemorySessionRepository();

  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: 'routes-test-user' };
    next();
  });
  app.use(
    createRoutes({
      sessions,
      rag: {} as RagService,
      chat: {} as ChatOrchestrationService,
      guide: {} as GuideOrchestrationService,
      openAi: {} as OpenAiService,
    }),
  );

  const server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    const port = (address as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Regression session' }),
    });
    const body = (await response.json()) as CreateSessionResponse;

    assert.equal(response.status, 201);
    assert.equal(body.session.title, 'Regression session');
    assert.equal(typeof body.session.id, 'string');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

void test('/api/ask retrieves sources through RagService', async () => {
  const app = express();
  const sessions = new InMemorySessionRepository();
  const ragSource: SourceProvenance = {
    id: 'rag-only',
    title: 'RAG only source',
    excerpt: 'This source only appears when RagService is used.',
    sourceType: 'knowledge_base',
    score: 0.99,
  };
  const calls: Array<{ query: string; options: RetrievalOptions }> = [];
  const rag = {
    async retrieve(query: string, options: RetrievalOptions): Promise<RetrievalContext> {
      calls.push({ query, options });
      return {
        query,
        sources: [ragSource],
        knowledgeBaseSources: [ragSource],
        webSources: [],
      };
    },
  } as RagService;

  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: 'routes-test-user' };
    next();
  });
  app.use(
    createRoutes({
      sessions,
      rag,
      chat: {} as ChatOrchestrationService,
      guide: {} as GuideOrchestrationService,
      openAi: { answer: async () => undefined } as unknown as OpenAiService,
    }),
  );

  const server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    const port = (address as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Use rag please', webSearchEnabled: true }),
    });
    const body = (await response.json()) as { sources: SourceProvenance[] };

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ query: 'Use rag please', options: { webSearchEnabled: true } }]);
    assert.equal(body.sources[0]?.id, 'rag-only');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

void test('non-health API routes require authentication', async () => {
  const app = express();
  const sessions = new InMemorySessionRepository();

  app.use(express.json());
  app.use(createAuthMiddleware(createTestConfig()));
  app.use(
    createRoutes({
      sessions,
      rag: {} as RagService,
      chat: {} as ChatOrchestrationService,
      guide: {} as GuideOrchestrationService,
      openAi: {} as OpenAiService,
    }),
  );

  const server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    const port = (address as AddressInfo).port;
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/sessions`);
    const authorized = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
      headers: {
        authorization: 'Bearer test-token',
        'x-user-id': 'route-owner',
      },
    });

    assert.equal(health.status, 200);
    assert.equal(unauthorized.status, 401);
    assert.equal(authorized.status, 200);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

function createTestConfig(): ServerConfig {
  return {
    port: 0,
    nodeEnv: 'test',
    corsOrigins: [],
    requestBodyLimit: '1mb',
    rateLimitWindowMs: 60_000,
    rateLimitMax: 100,
    authDisabled: false,
    apiAuthToken: 'test-token',
    sessionStorePath: 'unused',
    webSearchAllowed: false,
    openAiModel: 'test-model',
    openAiTimeoutMs: 100,
    openAiMaxRetries: 0,
    guideMaxDepth: 2,
    ragWebsiteAllowlist: [],
    ragMaxFileBytes: 1024,
    ragMaxChunksPerSource: 4,
  };
}
