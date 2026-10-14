import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ALLOWLIST = new Set([
  'src/app/[locale]/(app)/projects/[projectId]/project-files-tab.tsx',
  'src/app/[locale]/(app)/company-files/company-files-tab.tsx',
  'src/modules/employee-app/ui/employee-project-files-browser.tsx',
  'src/modules/external-storage/ui/storage-file-preview-dialog.tsx',
]);

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!full.endsWith('.tsx')) continue;
    if (full.includes(`${path.sep}ui${path.sep}`) || full.includes(`${path.sep}app${path.sep}`)) {
      out.push(full.replace(/\\/g, '/'));
    }
  }
}

describe('generated PDF download guard (OD-33)', () => {
  it('does not attach statutory/generated PDFs as downloads in product UI', () => {
    const files: string[] = [];
    walk(path.join(process.cwd(), 'src'), files);
    const offenders: string[] = [];
    for (const file of files) {
      const normalized = file.replace(/\\/g, '/');
      if (ALLOWLIST.has(normalized)) continue;
      const source = readFileSync(file, 'utf8');
      if (
        /disposition\s*=\s*['"]attachment['"]|downloadPdf|pdfUrl\([^)]*['"]attachment['"]\)/i.test(
          source,
        )
      ) {
        offenders.push(normalized);
      }
    }
    expect(offenders).toEqual([]);
  });
});
