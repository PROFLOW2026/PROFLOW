import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dashboard company files quick access aria (NF-UX-04)', () => {
  it('does not reuse dashboard quickActions as section aria-label', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/modules/external-storage/ui/dashboard-quick-access-bar.tsx',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/getTranslations\(['"]dashboard['"]\)/);
    expect(source).not.toMatch(/t\(['"]quickActions['"]\)/);
    expect(source).toContain("getTranslations('externalStorage')");
    expect(source).toContain("t('quickAccess.ariaLabel')");
  });
});
