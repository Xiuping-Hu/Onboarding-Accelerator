import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config';

const controlledEnvironment = [
  'AI_PROVIDER',
  'AUTH_DISABLED',
  'DATABASE_URL',
  'EMBEDDING_PROVIDER',
  'MASTRA_RAG_WORKFLOW_ENABLED',
  'MASTRA_STORAGE_SCHEMA',
  'NODE_ENV',
  'RAG_KNOWLEDGE_MAP_ENABLED',
  'RAG_VECTOR_ENABLED',
  'SESSION_STORE',
  'STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID',
  'STATIC_ROADMAP_ENABLED',
] as const;

void test('static roadmap cron bootstrap ID is optional, trimmed, and bounded to a safe charset', () => {
  withTestEnvironment(() => {
    process.env.STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID = '  bootstrap-2026.08.16:release_1  ';
    assert.equal(loadConfig().staticRoadmapBootstrapRequestId, 'bootstrap-2026.08.16:release_1');

    process.env.STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID = '   ';
    assert.equal(loadConfig().staticRoadmapBootstrapRequestId, undefined);

    process.env.STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID = 'bootstrap id with spaces';
    assert.throws(() => loadConfig(), /STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID/);

    process.env.STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID = 'a'.repeat(129);
    assert.throws(() => loadConfig(), /STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID/);
  });
});

function withTestEnvironment(run: () => void): void {
  const previous = new Map(controlledEnvironment.map((name) => [name, process.env[name]] as const));
  Object.assign(process.env, {
    AI_PROVIDER: 'openai',
    AUTH_DISABLED: 'true',
    EMBEDDING_PROVIDER: 'local',
    MASTRA_RAG_WORKFLOW_ENABLED: 'false',
    MASTRA_STORAGE_SCHEMA: 'mastra_workflow',
    NODE_ENV: 'test',
    RAG_KNOWLEDGE_MAP_ENABLED: 'false',
    RAG_VECTOR_ENABLED: 'false',
    SESSION_STORE: 'file',
    STATIC_ROADMAP_ENABLED: 'false',
  });
  delete process.env.DATABASE_URL;
  try {
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else Reflect.set(process.env, name, value);
    }
  }
}
