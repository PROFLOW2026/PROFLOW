import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('QuickCreate FAB presentation', () => {
  it('does not demote to toolbar on /new or /edit', () => {
    const file = readFileSync(
      path.join(process.cwd(), 'src/components/shell/quick-create.tsx'),
      'utf8',
    );
    expect(file).not.toContain('isFocusedComposerPath');
    expect(file).not.toContain('data-pf-quick-create="toolbar"');
    expect(file).toContain('data-pf-quick-create="fab"');
    expect(file).toContain('QuickCreateFabPortal');
  });
});
