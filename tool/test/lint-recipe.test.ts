import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { typedPromiseConfig } from '../src/recipes/typed-eslint.js';

test('pinned typescript-eslint catches floating/misused promises and accepts handled ones', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-eslint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"compilerOptions":{"strict":true,"target":"ES2022","types":[]},"include":["*.ts"]}');
  const bad = path.join(root, 'bad.ts'), good = path.join(root, 'good.ts');
  fs.writeFileSync(bad, 'Promise.resolve(1); if (Promise.resolve(true)) { console.log("bad"); }');
  fs.writeFileSync(good, 'void Promise.resolve(1); async function run() { if (await Promise.resolve(true)) { return 1; } return 0; } void run();');
  const lint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: typedPromiseConfig(root) });
  const results = await lint.lintFiles([bad, good]);
  assert.ok(results[0]?.messages.some(m => m.ruleId === '@typescript-eslint/no-floating-promises'));
  assert.ok(results[0]?.messages.some(m => m.ruleId === '@typescript-eslint/no-misused-promises'));
  assert.equal(results[1]?.errorCount, 0);
});
