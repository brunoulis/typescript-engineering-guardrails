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
  const files: Record<string, string> = { 'src/db.ts': 'import oracledb from "oracledb";\noracledb.initOracleClient({ libDir: "x" });\n' };
  for (const [directory, libraryVersion] of [['instantclient_19_21', '19.1'], ['instantclient_12_2', '12.2']]) {
    files[`c/${directory}/oci.dll`] = '';
    files[`c/${directory}/libclntsh.so.${libraryVersion}`] = '';
    files[`c/${directory}/libclntsh.dylib.${libraryVersion}`] = '';
  }
  const root = tree(t, files);
  const common = ['doctor', 'oracle', '--root', root, '--format', 'json'];
  assert.equal(main([...common, '--client-dir', path.join(root, 'c/instantclient_19_21')]), 0);
  assert.equal(main([...common, '--client-dir', path.join(root, 'c/instantclient_12_2')]), 2);
  assert.equal(main(['doctor']), 1);
  assert.equal(main(['doctor', 'oracle', '--wat']), 1);
});
