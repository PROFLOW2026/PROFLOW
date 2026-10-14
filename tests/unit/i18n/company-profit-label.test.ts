import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Locale } from '@/shared/i18n/config';

type KpiDetail = {
  labelRecognizedRevenue: string;
  companyProfitFormula: string;
};

const LOCALES: readonly { locale: Locale; forbidden: string[] }[] = [
  { locale: 'he-IL', forbidden: ['הכנסה מוכרת'] },
  { locale: 'en', forbidden: ['Recognized revenue'] },
  { locale: 'ar', forbidden: ['إيراد معترف به', 'الإيراد المعترف'] },
  { locale: 'ru', forbidden: ['Признанная выручка', 'признанная выручка'] },
];

function loadKpiDetail(locale: Locale): KpiDetail {
  const path = join(process.cwd(), 'src/locales', locale, 'dashboard.json');
  const catalog = JSON.parse(readFileSync(path, 'utf8')) as { kpiDetail: KpiDetail };
  return catalog.kpiDetail;
}

describe('company profit KPI labels (U02 / OD-02)', () => {
  for (const { locale, forbidden } of LOCALES) {
    it(`${locale}: labelRecognizedRevenue uses current contract value wording`, () => {
      const { labelRecognizedRevenue, companyProfitFormula } = loadKpiDetail(locale);
      for (const phrase of forbidden) {
        expect(labelRecognizedRevenue).not.toContain(phrase);
        expect(companyProfitFormula).not.toContain(phrase);
      }
      expect(companyProfitFormula).toContain(labelRecognizedRevenue);
    });
  }
});
