import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODECAD_VERSION = 'v0.1.0';
const CODECAD_BASE =
  'https://backkem.github.io/codecad/embed';

const targets = [
  {
    url: `${CODECAD_BASE}/codecad-viewer.js`,
    dest: path.join(root, 'public', 'cad', 'codecad-v0.1.0', 'codecad-viewer.js'),
    minBytes: 5_000,
  },
  {
    url: `${CODECAD_BASE}/cadview-web.js`,
    dest: path.join(root, 'public', 'cad', 'codecad-v0.1.0', 'cadview-web.js'),
    minBytes: 100_000,
  },
  {
    url: `${CODECAD_BASE}/cadview-web_bg.wasm`,
    dest: path.join(root, 'public', 'cad', 'codecad-v0.1.0', 'cadview-web_bg.wasm'),
    minBytes: 1_000_000,
  },
];

const mtextWorkerSrc = path.join(
  root,
  'node_modules',
  '@mlightcad',
  'cad-simple-viewer',
  'dist',
  'mtext-renderer-worker.js',
);
const mtextWorkerDest = path.join(root, 'public', 'cad-workers', 'mtext-renderer-worker.js');

async function download(url, dest, minBytes) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[copy-cad-assets] ${url} -> HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < minBytes) {
    throw new Error(
      `[copy-cad-assets] ${path.basename(dest)} too small (${buffer.byteLength} bytes)`,
    );
  }
  fs.writeFileSync(dest, buffer);
  console.log(
    `[copy-cad-assets] ${url} -> ${path.relative(root, dest)} (${buffer.byteLength} bytes)`,
  );
}

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

const manifestPath = path.join(root, 'public', 'cad', 'codecad-v0.1.0', 'version.json');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

for (const item of targets) {
  await download(item.url, item.dest, item.minBytes);
}
copyMtextWorker();

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      codecad: CODECAD_VERSION,
      source: CODECAD_BASE,
      mtextWorker: 'mtext-renderer-worker.js',
    },
    null,
    2,
  )}\n`,
);
