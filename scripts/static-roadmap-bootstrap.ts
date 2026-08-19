import { createStaticRoadmapRuntime } from '../apps/web/src/server/modules/static-roadmap/runtime';

process.env.AUTH_DISABLED ??= 'true';

const args = process.argv.slice(2);
const requestId = argumentValue('--request-id');
if (!requestId?.trim()) {
  throw new Error('--request-id is required and must be a durable operator-controlled value.');
}

const runtime = createStaticRoadmapRuntime();
try {
  if (!runtime.config.staticRoadmapEnabled) {
    throw new Error('STATIC_ROADMAP_ENABLED=true is required.');
  }
  const result = await runtime.service.bootstrap({ requestId });
  console.info(JSON.stringify(result));
} finally {
  await runtime.close();
}

function argumentValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
