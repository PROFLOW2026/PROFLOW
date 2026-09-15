import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFJS_WORKER_PUBLIC_PATH } from '@/modules/external-storage/ui/pdf-viewer-config';

const root = process.cwd();
const workerPath = path.join(root, 'public', 'pdf.worker.min.mjs');
const manifestPath = path.join(root, 'public', 'pdf.worker.version.json');
const pdfjsPackage = JSON.parse(
  fs.readFileSync(
    path.join(root, 'node_modules', 'pdfjs-dist', 'package.json'),
    'utf8',
  ),
) as { version: string };

describe('pdf worker static asset', () => {
  it('is committed under public/ for Vercel static output', () => {
    expect(fs.existsSync(workerPath)).toBe(true);
    const size = fs.statSync(workerPath).size;
    expect(size).toBeGreaterThan(100_000);
  });

  it('matches installed pdfjs-dist version', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { version: string };
    expect(manifest.version).toBe(pdfjsPackage.version);
  });

  it('uses the public URL expected by the viewer', () => {
    expect(PDFJS_WORKER_PUBLIC_PATH).toBe('/pdf.worker.min.mjs');
  });
});
