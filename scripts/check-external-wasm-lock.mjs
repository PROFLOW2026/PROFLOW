import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(
  fs.readFileSync(path.join(root, 'tests/fixtures/external-tools/baseline/wasm-lock.json'), 'utf8'),
);

let failed = false;
for (const row of lock.binaries) {
  const full = path.join(root, row.path);
  const bytes = fs.readFileSync(full);
  const sha = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (sha !== row.sha256 || bytes.length !== row.bytes) {
    console.error(`WASM LOCK FAIL ${row.path} sha=${sha} bytes=${bytes.length}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('[external-wasm-lock] existing viewer binaries unchanged');
