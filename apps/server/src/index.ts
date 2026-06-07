import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import { ChatOrchestrationService } from './chatService.js';
import { loadConfig } from './config.js';
import { GuideOrchestrationService } from './guideService.js';
import { RagService } from './ragService.js';
import { createRoutes } from './routes.js';
import { InMemorySessionRepository } from './sessionRepository.js';
import { PolicyAwareWebSearchProvider } from './webSearchProvider.js';

const config = loadConfig();
const app = express();
const sessions = new InMemorySessionRepository();
const rag = new RagService(new PolicyAwareWebSearchProvider(config.webSearchAllowed));
const chat = new ChatOrchestrationService(sessions, rag);
const guide = new GuideOrchestrationService(sessions, rag);

app.use(cors());
app.use(express.json());
app.use(createRoutes({ sessions, chat, guide }));

app.use((error: unknown, _request: express.Request, response: express.Response) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: 'Invalid request', details: error.flatten() });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'Unexpected server error' });
});

app.listen(config.port, () => {
  console.info(`Onboarding server listening on http://localhost:${config.port}`);
});
