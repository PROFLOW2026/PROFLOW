import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const mtextWorkerSrc = path.join(
  root,
  'node_modules',
  '@mlightcad',
  'cad-simple-viewer',
  'dist',
  'mtext-renderer-worker.js',
);
const mtextWorkerDest = path.join(root, 'public', 'cad-workers', 'mtext-renderer-worker.js');
const manifestPath = path.join(root, 'public', 'cad-workers', 'version.json');

function copyMtextWorker() {
  if (!fs.existsSync(mtextWorkerSrc)) {
    throw new Error(`[copy-cad-assets] missing mtext worker at ${mtextWorkerSrc}`);
  }
  fs.mkdirSync(path.dirname(mtextWorkerDest), { recursive: true });
  fs.copyFileSync(mtextWorkerSrc, mtextWorkerDest);
  const size = fs.statSync(mtextWorkerDest).size;
  if (size < 1_000) {
    throw new Error(`[copy-cad-assets] mtext worker too small (${size} bytes)`);
  }
  console.log(
    `[copy-cad-assets] mtext worker -> ${path.relative(root, mtextWorkerDest)} (${size} bytes)`,
  );
}

copyMtextWorker();

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      mtextWorker: 'mtext-renderer-worker.js',
    },
    null,
    2,
  )}\n`,
);
