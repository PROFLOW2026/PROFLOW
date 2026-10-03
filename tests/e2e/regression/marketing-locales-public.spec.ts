import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoPageHorizontalOverflow, CRITICAL_OVERFLOW_WIDTHS, withViewport } from '../fixtures/layout';

const LOCALES = [
  { code: 'he-IL', dir: 'rtl', lang: 'he' },
  { code: 'en', dir: 'ltr', lang: 'en' },
  { code: 'ar', dir: 'rtl', lang: 'ar' },
  { code: 'ru', dir: 'ltr', lang: 'ru' },
] as const;

function marketingHeroTitle(locale: string): string {
  const folder = locale === 'he-IL' ? 'he-IL' : locale;
  const raw = readFileSync(join(process.cwd(), 'src/locales', folder, 'marketing.json'), 'utf8');
  return (JSON.parse(raw) as { hero: { title: string } }).hero.title;
}

for (const locale of LOCALES) {
  test.describe(`public marketing ${locale.code}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/${locale.code}`);
      if (page.url().includes('/setup')) {
        test.skip(true, 'Supabase/database not configured');
      }
    });

    test('renders homepage with correct direction and hero', async ({ page }) => {
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
      await expect(page.locator('[data-pf-public-homepage]')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(marketingHeroTitle(locale.code));
      await expect(page.locator('[data-pf-landing-footer]')).toBeVisible();
    });

    test('uses locale-scoped marketing screenshots', async ({ page }) => {
      const src = await page.locator('[data-pf-screenshot-frame="desktop"]').first().locator('img').getAttribute('src');
      expect(src).toContain(`/marketing/screenshots/${locale.code}/`);
    });

    test('has no horizontal overflow on critical widths', async ({ page }) => {
      for (const width of CRITICAL_OVERFLOW_WIDTHS) {
        await withViewport(page, width, async () => {
          await page.goto(`/${locale.code}`);
          if (page.url().includes('/setup')) {
            test.skip(true, 'setup environment');
          }
          await assertNoPageHorizontalOverflow(page, `${locale.code}@${width}`);
        });
      }
    });
  });
}
