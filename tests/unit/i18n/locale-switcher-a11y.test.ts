import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('locale switcher a11y', () => {
  it('does not hard-code English aria-label on the inline switcher', () => {
    const file = path.join(process.cwd(), 'src/shared/i18n/locale-switcher-inline.tsx');
    const source = readFileSync(file, 'utf8');
    expect(source).not.toContain('aria-label="Language"');
    expect(source).toContain("useTranslations('common.a11y')");
  });
});
