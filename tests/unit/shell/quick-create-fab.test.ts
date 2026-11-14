import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('QuickCreate FAB presentation', () => {
  it('hides the FAB on focused /new and /edit composer routes', () => {
    const file = readFileSync(
      path.join(process.cwd(), 'src/components/shell/quick-create.tsx'),
      'utf8',
    );
    expect(file).toContain('isFocusedComposerPath');
    expect(file).toContain('shouldHideQuickCreateForRoute');
    expect(file).not.toContain('data-pf-quick-create="toolbar"');
    expect(file).toContain('data-pf-quick-create="fab"');
    expect(file).toContain('QuickCreateFabPortal');
    expect(file).toContain("localeDir === 'rtl' ? 'left-4' : 'right-4'");
  });
});
