import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { routing } from '@/shared/i18n/routing';

describe('public launch SEO (L9)', () => {
  it('robots allows marketing and legal, disallows api and employee', () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const rule = rules[0]!;
    expect(rule.allow).toEqual(expect.arrayContaining(['/', '/legal/']));
    expect(rule.disallow).toEqual(expect.arrayContaining(['/api/', '/*/employee']));
    expect(r.sitemap).toMatch(/sitemap\.xml$/);
  });

  it('sitemap includes locale home and legal routes', () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    for (const locale of routing.locales) {
      expect(urls.some((u) => u.includes(`/${locale}/legal/terms`))).toBe(true);
      expect(urls.some((u) => u.includes(`/${locale}/legal/privacy`))).toBe(true);
    }
  });
});
