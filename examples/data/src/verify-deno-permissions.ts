import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const [permissions, expected] of [
  [['--allow-read=sql'], /Requires env access to "PGMAX_PIPELINE"/],
  [['--allow-read=sql','--allow-env=PGAPPNAME,PGMAX_PIPELINE'], /Requires net access to "127\.0\.0\.1:55432"/],
] as const) {
  const result = spawnSync(process.env['DENO_EXECUTABLE'] ?? 'deno', ['test','--no-prompt',...permissions,'test/runtime.deno.ts'], {encoding:'utf8',timeout:15000});
  if (result.error) throw result.error;
  assert.notEqual(result.status,0);
  assert.match(result.stdout+result.stderr, expected);
  console.log('Expected Deno permission rejection verified', expected.source);
}
const http = spawnSync(process.env['DENO_EXECUTABLE'] ?? 'deno',['test','--no-prompt','--filter','native HTTP','test/runtime.deno.ts'],{encoding:'utf8',timeout:15000});
if (http.error) throw http.error;
assert.notEqual(http.status,0);
assert.match(http.stdout+http.stderr,/Requires net access to "127\.0\.0\.1:0"/);
console.log('Expected Deno native listener permission rejection verified');
