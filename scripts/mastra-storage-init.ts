import { PostgresStore } from '@mastra/pg';
import { loadConfig } from '../apps/web/src/server/config';

const config = loadConfig();
if (!config.databaseUrl) throw new Error('DATABASE_URL is required.');

const storage = new PostgresStore({
  id: 'onboarding-rag-workflow-storage-init',
  connectionString: config.databaseUrl,
  schemaName: config.mastraStorageSchema,
  ssl: config.postgresSsl,
  max: config.mastraPostgresPoolMax,
  disableInit: false,
});

try {
  await storage.init();
  console.info(`Mastra storage is ready in schema ${config.mastraStorageSchema}.`);
} finally {
  await storage.close();
}
