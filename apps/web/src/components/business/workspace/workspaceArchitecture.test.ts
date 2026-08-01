import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const workspaceBusinessRoot = join(process.cwd(), 'src/components/business/workspace');
const workspaceRouteRoot = join(process.cwd(), 'src/app/workspace');

void test('workspace components use utilities without feature CSS or inline style props', async () => {
  const files = [
    ...(await findFiles(workspaceBusinessRoot, '.tsx')),
    ...(await findFiles(workspaceRouteRoot, '.tsx')),
  ];

  assert.ok(files.length > 0);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /(?:import|require\()[^\n]*\.css/);
    assert.doesNotMatch(source, /\bstyle\s*=\s*\{/);
  }
});

void test('workspace business components do not depend on App Router modules', async () => {
  const files = await findFiles(workspaceBusinessRoot, '.tsx');

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]@\/app(?:\/|['"])/);
  }
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
