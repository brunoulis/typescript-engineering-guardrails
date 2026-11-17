#!/usr/bin/env node
// Generated compatibility entry; maintained source is tool/src/legacy.cts.
import path from 'node:path';
const api = require(path.join(__dirname, '../dist/tool/src/index.js')) as typeof import('./index.js');
export const { getTS, audit, scan, files } = api;
if (require.main === module) {
  const { main } = require(path.join(__dirname, '../dist/tool/src/cli.js')) as typeof import('./cli.js');
  process.exitCode = main();
}
