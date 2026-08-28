import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Experience preview shell placement', () => {
  it('renders the switcher only in secondary navigation slots', () => {
    const source = readFileSync(join(ROOT, 'src/components/shell/app-shell.tsx'), 'utf8');
    const headerSlice = source.slice(
      source.indexOf('<ConnectivityBanner />'),
      source.indexOf('<TopBar'),
    );

    expect(headerSlice).not.toContain('<ExperiencePreviewSwitcher');
    expect(source).toContain('footer={experiencePreviewSwitcher}');
    expect(source).toContain('moreFooter={experiencePreviewSwitcher}');
  });
});
