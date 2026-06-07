import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import { loadConfig } from './config.js';
import { createRoutes } from './routes.js';

const config = loadConfig();
const app = express();

app.use(cors());
app.use(express.json());
app.use(createRoutes());

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
