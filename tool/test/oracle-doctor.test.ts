import type { TestContext } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientVersion, compareVersions, oracleDoctor, parseVersion } from '../src/core/oracle-doctor.js';

function tree(t: TestContext, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-doctor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}
const thick = { 'src/db.ts': 'import oracledb from "oracledb";\noracledb.initOracleClient({ libDir: "x" });\n' };
const base = { minimum: '19.1', env: {} as NodeJS.ProcessEnv };

test('versions parse and compare numerically', () => {
  assert.deepEqual(parseVersion('19.21.0'), [19, 21, 0]);
  assert.equal(parseVersion('v19'), undefined);
  assert.ok(compareVersions([19, 1], [12, 2]) > 0);
  assert.ok(compareVersions([19], [19, 1]) < 0);
  assert.equal(compareVersions([19, 1, 0], [19, 1]), 0);
});
test('client version comes from the library suffix, the Instant Client directory or an Oracle home path only', () => {
  assert.deepEqual(clientVersion('/x/client', 'libclntsh.so.21.1'), { version: '21.1', evidence: 'library file name libclntsh.so.21.1' });
  assert.equal(clientVersion('C:\\oracle\\instantclient_19_21', 'oci.dll').version, '19.21');
  assert.deepEqual(clientVersion('C:\\Oracle\\product\\12.2.0\\client_64\\bin', 'oci.dll'), { version: '12.2.0', evidence: 'Oracle home path C:\\Oracle\\product\\12.2.0\\client_64\\bin' });
  assert.equal(clientVersion('/x/client', 'oci.dll').version, undefined);
});

test('a recent client is OK and the driver mode is thick with evidence', t => {
  const root = tree(t, { ...thick, 'client/instantclient_19_21/oci.dll': '' });
  const report = oracleDoctor({ ...base, root, platform: 'win32', clientDir: path.join(root, 'client/instantclient_19_21') });
  assert.equal(report.status, 'OK');
  assert.deepEqual(report.mode, { value: 'thick', evidence: [{ file: 'src/db.ts', line: 2 }] });
  assert.equal(report.client?.version, '19.21');
  assert.equal(report.client?.origin, '--client-dir');
});
test('an old client is TOO_OLD', t => {
  const root = tree(t, { ...thick, 'c/instantclient_12_2/oci.dll': '' });
  assert.equal(oracleDoctor({ ...base, root, platform: 'win32', clientDir: path.join(root, 'c/instantclient_12_2') }).status, 'TOO_OLD');
});
test('the client is found through PATH on the platform library name', t => {
  const root = tree(t, { ...thick, 'bin/libclntsh.so.21.1': '' });
  const report = oracleDoctor({ ...base, root, platform: 'linux', env: { LD_LIBRARY_PATH: path.join(root, 'bin') } });
  assert.equal(report.status, 'OK');
  assert.equal(report.client?.origin, 'LD_LIBRARY_PATH');
});
test('an unversioned client directory is VERSION_UNKNOWN, never OK', t => {
  const root = tree(t, { ...thick, 'client/oci.dll': '' });
  const report = oracleDoctor({ ...base, root, platform: 'win32', clientDir: path.join(root, 'client') });
  assert.equal(report.status, 'VERSION_UNKNOWN');
});
test('no client is MISSING and a bad --client-dir is explained', t => {
  const root = tree(t, thick);
  const report = oracleDoctor({ ...base, root, platform: 'win32', clientDir: path.join(root, 'nope') });
  assert.equal(report.status, 'MISSING');
  assert.ok(report.notes.some(note => /not a readable directory/.test(note)));
});
test('thin mode needs no client', t => {
  const root = tree(t, { 'src/db.ts': 'import oracledb from "oracledb";\nexport const o = oracledb;\n' });
  const report = oracleDoctor({ ...base, root, platform: 'win32' });
  assert.equal(report.status, 'NOT_REQUIRED');
  assert.equal(report.mode.value, 'thin');
});
test('client libraries for another platform inside the project are listed', t => {
  const root = tree(t, { ...thick, 'libocci.so.21.1': '', 'node_modules/x/libocci.so.1': '' });
  assert.deepEqual(oracleDoctor({ ...base, root, platform: 'win32' }).foreignLibraries, [{ file: 'libocci.so.21.1', platform: 'linux' }]);
  assert.deepEqual(oracleDoctor({ ...base, root, platform: 'linux' }).foreignLibraries, []);
});
test('an invalid minimum is rejected', t => {
  assert.throws(() => oracleDoctor({ ...base, root: tree(t, thick), platform: 'linux', minimum: 'abc' }), /minimum/);
});
