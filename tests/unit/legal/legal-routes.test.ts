import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('legal public routes (L1/L2)', () => {
  it('terms and privacy pages exist with Hebrew content modules', () => {
    const termsPage = readFileSync(
      resolve('src/app/[locale]/legal/terms/page.tsx'),
      'utf8',
    );
    const privacyPage = readFileSync(
      resolve('src/app/[locale]/legal/privacy/page.tsx'),
      'utf8',
    );
    expect(termsPage).toContain('TermsHebrewContent');
    expect(privacyPage).toContain('PrivacyHebrewContent');
    expect(termsPage).toContain('index: true');
    expect(privacyPage).toContain('index: true');
  });

  it('deletion procedure doc exists for support-managed erasure', () => {
    const doc = readFileSync(
      resolve('docs/operations/DATA-DELETION-REQUEST-PROCEDURE.md'),
      'utf8',
    );
    expect(doc).toContain('support-managed');
    expect(doc).toMatch(/Verify authority/i);
  });
});
