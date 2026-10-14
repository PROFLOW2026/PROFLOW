import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['he-IL', 'ar', 'ru'] as const;

describe('business profitability hints without CCV jargon', () => {
  for (const locale of LOCALES) {
    it(`${locale} companyProfitHint avoids CCV`, () => {
      const file = path.join(process.cwd(), `src/locales/${locale}/financial.json`);
      const json = JSON.parse(readFileSync(file, 'utf8')) as {
        businessProfitability?: { kpis?: { companyProfitHint?: string } };
      };
      const kpis = json.businessProfitability?.kpis as { companyProfitHint?: string } | undefined;
      const hint = kpis?.companyProfitHint ?? '';
      expect(hint.toUpperCase()).not.toContain('CCV');
    });
  }
});
