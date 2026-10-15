import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const vinextRequire = createRequire(import.meta.resolve('vinext'));
const commonjsRequire = createRequire(vinextRequire.resolve('vite-plugin-commonjs'));
const pluginPath = commonjsRequire.resolve('vite-plugin-dynamic-import');
const pluginRequire = createRequire(pluginPath);
const { parseExpressionAt } = pluginRequire('acorn');

for (const format of ['index.js', 'index.mjs']) {
  const { globFiles } = await import(pathToFileURL(join(dirname(pluginPath), format)).href);
  for (const scenario of [
    { expression: '`./views/${name}.js`', loose: false, expected: ['./views/home.js'] },
    {
      expression: '`./views/${name}`',
      loose: false,
      expected: ['./views/home.js', './views/profile.tsx', './views/settings/index.ts'],
    },
    {
      expression: '`./views/${name}.js`',
      loose: true,
      expected: ['./views/home.js', './views/nested/detail.js'],
    },
    { expression: '`./missing/${name}.js`', loose: false, expected: [] },
  ]) {
    test(`dynamic imports (${format}): ${scenario.expression}, loose=${scenario.loose}`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'feeder-dynamic-import-'));
      try {
        for (const file of [
          'views/home.js',
          'views/profile.tsx',
          'views/settings/index.ts',
          'views/nested/detail.js',
          'views/ignored.txt',
          'views/.hidden.js',
        ]) {
          const target = join(root, file);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, 'export default 1;');
        }
        const result = await globFiles({
          importeeNode: parseExpressionAt(scenario.expression, 0, { ecmaVersion: 'latest' }),
          importExpression: scenario.expression,
          importer: join(root, 'entry.js'),
          resolve: { tryResolve: async () => undefined },
          extensions: ['.js', '.ts', '.tsx'],
          loose: scenario.loose,
        });
        assert.deepEqual(result.files.sort(), scenario.expected);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
}
