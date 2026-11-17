import type { TestContext } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.js';

function tree(t: TestContext, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-doctor-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test('doctor CLI exit codes: 0 OK, 2 too old, 1 usage', t => {
  // Every platform's library name is present so the test does not depend on the host OS.
  const libraries = ['oci.dll', 'libclntsh.so.19.1', 'libclntsh.dylib.19.1'];
  const files: Record<string, string> = { 'src/db.ts': 'import oracledb from "oracledb";\noracledb.initOracleClient({ libDir: "x" });\n' };
  for (const dir of ['c/instantclient_19_21', 'c/instantclient_12_2']) for (const library of libraries) files[`${dir}/${library}`] = '';
  const root = tree(t, files);
  const common = ['doctor', 'oracle', '--root', root, '--format', 'json'];
  assert.equal(main([...common, '--client-dir', path.join(root, 'c/instantclient_19_21')]), 0);
  assert.equal(main([...common, '--client-dir', path.join(root, 'c/instantclient_12_2')]), 2);
  assert.equal(main(['doctor']), 1);
  assert.equal(main(['doctor', 'oracle', '--wat']), 1);
});
