import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src', 'locales');

function readMarketing(locale: 'he-IL' | 'en'): string {
  return readFileSync(join(ROOT, locale, 'marketing.json'), 'utf8');
}

describe('homepage marketing copy hygiene', () => {
  it('keeps Hebrew marketing free of engineering/accounting slogan marks and AI dashes', () => {
    const he = readMarketing('he-IL');
    expect(he).not.toMatch(/≠/);
    expect(he).not.toMatch(/[–—]/);
    expect(he).not.toMatch(/\bOCR\b/i);
    expect(he).not.toMatch(/פורטל לקוחות|פורטל ספקים|customer portal|vendor portal/i);
    expect(he).not.toMatch(/מהפכה בניהול|הדור הבא|פתרון מקצה לקצה/);
    expect(JSON.parse(he).financial.insights?.length).toBeGreaterThanOrEqual(3);
    expect(JSON.parse(he).financial.principles).toBeUndefined();
    expect(JSON.parse(he).financial.neq).toBeUndefined();
  });

  it('keeps English marketing in parity shape without portal or OCR acronym claims', () => {
    const en = readMarketing('en');
    expect(en).not.toMatch(/≠/);
    expect(en).not.toMatch(/[–—]/);
    expect(en).not.toMatch(/\bOCR\b/i);
    expect(en).not.toMatch(/customer portal|vendor portal/i);
    expect(JSON.parse(en).financial.insights?.length).toBeGreaterThanOrEqual(3);
    expect(JSON.parse(en).tour.tabs).toHaveLength(7);
  });
});
