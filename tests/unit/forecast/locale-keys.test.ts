import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EARLY_WARNING_CLASSES } from '@/modules/forecast/domain/types';

function readForecast(locale: 'en' | 'he-IL'): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'src', 'locales', locale, 'forecast.json'), 'utf8'),
  ) as Record<string, unknown>;
}

describe('forecast locale keys', () => {
  it('labels warning classes in English and Hebrew', () => {
    const en = readForecast('en');
    const he = readForecast('he-IL');
    const enClass = en.class as Record<string, string>;
    const heClass = he.class as Record<string, string>;

    for (const warningClass of EARLY_WARNING_CLASSES) {
      expect(enClass[warningClass]?.length).toBeGreaterThan(0);
      expect(heClass[warningClass]?.length).toBeGreaterThan(0);
    }

    expect(enClass.confirmed).toBe('Confirmed');
    expect(enClass.projected).toBe('Projected');
    expect(enClass.missing_data).toBe('Missing data');
    expect(heClass.confirmed).toBe('מאומת');
    expect(heClass.projected).toBe('צפוי');
    expect(heClass.missing_data).toBe('חסרים נתונים');
    expect(en.recommendationNote).toBe('Recommendation — not accounting truth.');
  });
});
