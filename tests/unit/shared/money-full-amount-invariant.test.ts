import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('money full-amount invariant', () => {
  it('does not expose compact currency notation in the central formatter', () => {
    const format = read('src/shared/money/format.ts');
    expect(format).not.toContain("notation: compact");
    expect(format).not.toContain("notation: 'compact'");
    expect(format).not.toMatch(/compact\s*\?\s*['"]compact['"]/);
    expect(format).toContain("notation: 'standard'");
  });

  it('does not pass compact to MoneyText for currency display', () => {
    const files = [
      'src/modules/financials/ui/home-dashboard-content.tsx',
      'src/modules/financials/ui/project-financials-panel.tsx',
      'src/modules/financials/ui/project-vendor-actual-panel.tsx',
      'src/app/[locale]/(app)/projects/page.tsx',
      'src/modules/projects/ui/project-contracts-client.tsx',
      'src/app/[locale]/(app)/projects/[projectId]/overview-contract-history.tsx',
    ];
    for (const file of files) {
      const content = read(file);
      expect(content, file).not.toMatch(/<MoneyText[^>]*\bcompact\b/);
    }
  });
});
