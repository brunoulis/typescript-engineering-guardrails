import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(__dirname, '../..');
fs.copyFileSync(path.join(root, 'dist/tool/src/legacy.cjs'), path.join(root, 'scripts/ts-rails-audit.cjs'));
