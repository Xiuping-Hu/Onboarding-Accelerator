import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { CreateSessionBodySchema, UpdateSessionBodySchema } from './modules/sessions/session.dto';

void test('route adapters contain no DTO schemas or business-service calls', async () => {
  const routeFiles = await findFiles(join(process.cwd(), 'src/app'), 'route.ts');
  assert.ok(routeFiles.length > 0);
  for (const file of routeFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]zod['"]/);
    assert.doesNotMatch(source, /services\.|\.record\(/);
    assert.match(source, /createRouteHandler/);
  }
});

void test('application services do not import HTTP, Zod, or Prisma infrastructure', async () => {
  const serviceFiles = await findFiles(join(process.cwd(), 'src/server/modules'), '.service.ts');
  assert.ok(serviceFiles.length > 0);
  for (const file of serviceFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /next\/server|from ['"]zod['"]|generated\/prisma|\bPrisma\b/);
  }
});

void test('retired admin operations are absent from the server graph', async () => {
  for (const path of [
    join(process.cwd(), 'src/server/adminOpsService.ts'),
    join(process.cwd(), 'src/server/modules/admin'),
    join(process.cwd(), 'src/server/modules/knowledge-maps/knowledgeMap.controller.ts'),
    join(process.cwd(), 'src/server/modules/knowledge-maps/knowledgeMap.dto.ts'),
    join(process.cwd(), 'src/server/modules/knowledge-maps/knowledgeMap.service.ts'),
  ]) {
    await assert.rejects(() => access(path));
  }

  const containerSource = await readFile(
    join(process.cwd(), 'src/server/bootstrap/appContainer.ts'),
    'utf8',
  );
  assert.doesNotMatch(containerSource, /adminOpsService|controllers\.admin|services\.admin/);
});

void test('session DTOs enforce boundary validation and defaults', () => {
  assert.deepEqual(CreateSessionBodySchema.parse({ title: 'First week' }), {
    title: 'First week',
  });
  assert.throws(() => UpdateSessionBodySchema.parse({ expandedNodeIds: [1] }));
});

async function findFiles(root: string, suffix: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory()
        ? findFiles(path, suffix)
        : Promise.resolve(entry.name.endsWith(suffix) ? [path] : []);
    }),
  );
  return files.flat();
}
