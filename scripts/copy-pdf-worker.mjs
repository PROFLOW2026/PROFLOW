import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfjsPackageJson = fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'));
const pdfjsDistPath = path.dirname(pdfjsPackageJson);
const pdfjsVersion = JSON.parse(fs.readFileSync(pdfjsPackageJson, 'utf8')).version;
const source = path.join(pdfjsDistPath, 'build', 'pdf.worker.min.mjs');
const targetDir = path.join(root, 'public');
const target = path.join(targetDir, 'pdf.worker.min.mjs');
const manifest = path.join(targetDir, 'pdf.worker.version.json');

if (!fs.existsSync(source)) {
  console.error(`[copy-pdf-worker] missing source worker at ${source}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
fs.writeFileSync(
  manifest,
  `${JSON.stringify({ version: pdfjsVersion, file: 'pdf.worker.min.mjs' }, null, 2)}\n`,
);

const size = fs.statSync(target).size;
if (size < 100_000) {
  console.error(`[copy-pdf-worker] worker file too small (${size} bytes)`);
  process.exit(1);
}

console.log(
  `[copy-pdf-worker] pdfjs-dist@${pdfjsVersion} -> ${path.relative(root, target)} (${size} bytes)`,
);
