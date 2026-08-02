import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import test from 'node:test';

const sourceRoot = join(process.cwd(), 'src');
const appRoot = join(sourceRoot, 'app');
const sharedComponentsRoot = join(sourceRoot, 'components');
const workspaceComponentsRoot = join(appRoot, 'workspace', 'components');

void test('frontend components use Tailwind without feature CSS or inline style props', async () => {
  const files = [
    ...(await findFiles(appRoot, '.tsx')),
    ...(await findFiles(sharedComponentsRoot, '.tsx')),
  ];

  assert.ok(files.length > 0);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (file === join(appRoot, 'layout.tsx')) {
      assert.match(source, /import ['"]\.\/globals\.css['"]/);
    } else {
      assert.doesNotMatch(source, /(?:import|require\()[^\n]*\.css/);
    }
    assert.doesNotMatch(source, /\bstyle\s*=\s*\{/);
  }

  const cssFiles = await findFiles(sourceRoot, '.css');
  assert.deepEqual(
    cssFiles.map((file) => relative(sourceRoot, file)),
    [join('app', 'globals.css')],
  );
});

void test('business components are route-colocated and legacy component layers are absent', async () => {
  for (const legacyPath of [
    join(sharedComponentsRoot, 'business'),
    join(sharedComponentsRoot, 'common'),
    join(sharedComponentsRoot, 'shared'),
  ]) {
    await assert.rejects(access(legacyPath));
  }

  for (const routeName of ['login', 'workspace']) {
    const routeRoot = join(appRoot, routeName);
    for (const file of await findFiles(routeRoot, '.tsx')) {
      const name = basename(file);
      if (name === 'page.tsx' || name === 'layout.tsx' || name.endsWith('.test.tsx')) continue;
      assert.match(file, new RegExp(`${escapeRegex(sep)}components${escapeRegex(sep)}`));
    }
  }
});

void test('workspace business components do not depend on unrelated App Router modules', async () => {
  const files = await findFiles(workspaceComponentsRoot, '.tsx');

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]@\/app(?:\/|['"])/);
    assert.doesNotMatch(source, /from ['"][.]{2,}\/(?:admin|login)(?:\/|['"])/);
  }
});

void test('Radix imports are confined to source-owned shadcn primitives', async () => {
  const files = await findFiles(sourceRoot, '.tsx');
  const uiRoot = join(sharedComponentsRoot, 'ui');

  for (const file of files) {
    if (file.startsWith(`${uiRoot}${sep}`)) continue;
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]@radix-ui\//);
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
  return files.flat().sort();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
