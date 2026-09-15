import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfjsDistPath = path.dirname(
  fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')),
);
const source = path.join(pdfjsDistPath, 'build', 'pdf.worker.min.mjs');
const targetDir = path.join(root, 'public');
const target = path.join(targetDir, 'pdf.worker.min.mjs');

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`[copy-pdf-worker] ${path.relative(root, source)} -> ${path.relative(root, target)}`);
