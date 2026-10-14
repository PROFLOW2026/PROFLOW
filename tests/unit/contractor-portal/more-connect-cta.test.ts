import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const morePagePath = join(
  repoRoot,
  'src/app/[locale]/contractor/(portal)/more/page.tsx',
);

describe('contractor portal connect-org CTA', () => {
  it('routes through org sign-in instead of a direct connect-developer href', () => {
    const source = readFileSync(morePagePath, 'utf8');
    expect(source).not.toMatch(/href="\/projects\/connect-developer"/);
    expect(source).toContain('/sign-in?next=');
    expect(source).toContain('/projects/connect-developer');
  });

  it('has connect-org copy in all supported locales', () => {
    for (const locale of ['he-IL', 'en', 'ar', 'ru'] as const) {
      const json = JSON.parse(
        readFileSync(join(repoRoot, `src/locales/${locale}/contractorPortal.json`), 'utf8'),
      ) as {
        hub: { more: { connectOrgTitle: string; connectOrgDescription: string; connectOrgCta: string } };
      };
      expect(json.hub.more.connectOrgTitle.length).toBeGreaterThan(0);
      expect(json.hub.more.connectOrgDescription.length).toBeGreaterThan(0);
      expect(json.hub.more.connectOrgCta.length).toBeGreaterThan(0);
    }
  });
});
