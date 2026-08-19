import { hostname } from 'node:os';
import { createStaticRoadmapRuntime } from '../apps/web/src/server/modules/static-roadmap/runtime';

process.env.AUTH_DISABLED ??= 'true';

const args = process.argv.slice(2);
const limit = positiveArgument('--limit', 1, 100);
const runtime = createStaticRoadmapRuntime();
const workerId = `${hostname()}:${process.pid}:static-roadmap`;

try {
  if (!runtime.config.staticRoadmapEnabled) {
    throw new Error('STATIC_ROADMAP_ENABLED=true is required.');
  }
  let cycles = 0;
  let refreshes = 0;
  let syncedUsers = 0;
  while (cycles < limit) {
    const refresh = await runtime.service.processNextRefresh(workerId);
    const userSyncs = await runtime.service.processUserSyncs(workerId);
    console.info(JSON.stringify({ workerId, refresh, userSyncs }));
    if (refresh.processed) refreshes += 1;
    syncedUsers += userSyncs.processed;
    cycles += 1;
    if (!refresh.processed && userSyncs.processed === 0) break;
    if (refresh.status === 'failed' || userSyncs.failed > 0) process.exitCode = 1;
  }
  console.info(JSON.stringify({ workerId, cycles, refreshes, syncedUsers }));
} finally {
  await runtime.close();
}

function positiveArgument(name: string, fallback: number, maximum: number): number {
  const index = args.indexOf(name);
  const value = Number.parseInt(index >= 0 ? (args[index + 1] ?? '') : String(fallback), 10);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}
