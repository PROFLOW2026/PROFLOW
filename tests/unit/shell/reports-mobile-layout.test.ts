import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('reports mobile layout (UI-MOB-001)', () => {
  it('anchors the reports route with min-width-safe page chrome', () => {
    const page = read('src/app/[locale]/(app)/reports/page.tsx');
    expect(page).toContain('data-pf-reports-page');
    expect(page).toMatch(/min-w-0/);
    expect(page).toMatch(/max-w-full/);
  });

  it('keeps report pack rows and download actions within narrow viewports', () => {
    const packs = read('src/modules/reports/ui/report-packs-section.tsx');
    expect(packs).toMatch(/min-w-0 max-w-full flex-col gap-6/);
    expect(packs).toContain('break-words');

    const downloads = read('src/modules/reports/ui/report-download-buttons.tsx');
    expect(downloads).toMatch(/min-w-0 max-w-full/);
    expect(downloads).toContain('whitespace-normal');
  });

  it('uses export menu toolbar instead of a wide desktop button row', () => {
    const exports = read('src/app/[locale]/(app)/reports/reports-export-actions.tsx');
    expect(exports).toContain('DropdownMenu');
    expect(exports).toContain('horizontal overflow');
  });

  it('wraps advanced analysis gate copy on phone widths', () => {
    const gate = read('src/app/[locale]/(app)/reports/reports-advanced-analysis-gate.tsx');
    expect(gate).toMatch(/min-w-0 max-w-full/);
    expect(gate).toContain('break-words');
  });
});
