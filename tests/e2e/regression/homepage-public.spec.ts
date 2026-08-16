import { expect, test } from '@playwright/test';
import {
  assertNoPageHorizontalOverflow,
  CRITICAL_OVERFLOW_WIDTHS,
  PAGE_OVERFLOW_WIDTHS,
  withViewport,
} from '../fixtures/layout';
import { he } from '../fixtures/locales';

/**
 * Public ProjectFlow homepage - signed-out locale root.
 */
test.describe('public homepage', () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await page.goto('/he-IL');
    // Skip when the environment is not configured (setup screen).
    if (page.url().includes('/setup')) {
      test.skip(true, 'Supabase/database not configured - homepage requires configured app');
    }
  });

  test('renders Hebrew RTL homepage with one H1 and twelve sections', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('[data-pf-public-homepage]')).toBeVisible();
    await expect(page.locator('[data-pf-shell="app"]')).toHaveCount(0);

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(he.marketing.hero.title);

    const sections = [
      'hero',
      'questions-problem',
      'how-it-works',
      'capabilities',
      'financial',
      'commercial',
      'product-tour',
      'advanced',
      'mobile',
      'audience',
      'faq',
      'final-cta',
    ];
    for (const id of sections) {
      await expect(page.locator(`[data-pf-landing-section="${id}"]`)).toBeVisible();
    }
  });

  test('auth CTAs go to sign-in and secondary scrolls to how-it-works', async ({ page }) => {
    const headerSignIn = page.getByRole('link', { name: he.marketing.header.signIn }).first();
    await expect(headerSignIn).toHaveAttribute('href', /\/he-IL\/sign-in/);

    const primaryCtas = page.getByRole('link', { name: he.marketing.hero.primaryCta });
    await expect(primaryCtas.first()).toHaveAttribute('href', /\/he-IL\/sign-in/);

    await page.getByRole('link', { name: he.marketing.hero.secondaryCta }).first().click();
    await expect(page.locator('#how-it-works')).toBeInViewport();
  });

  test('FAQ is keyboard operable and omits OCR/portal/Gantt questions', async ({ page }) => {
    const faq = page.locator('[data-pf-landing-faq]');
    await expect(faq).toBeVisible();
    await expect(faq.getByRole('tab')).toHaveCount(4);

    const firstTrigger = faq.locator('[data-pf-faq-question]').first();
    await firstTrigger.scrollIntoViewIfNeeded();
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
    await firstTrigger.press('Enter');
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');

    await expect(page.getByText('OCR')).toHaveCount(0);
    await expect(page.getByText('פורטל לקוחות')).toHaveCount(0);
    await expect(page.getByText('Gantt')).toHaveCount(0);
    await expect(page.getByText('App Store')).toHaveCount(0);
    await expect(page.getByText('Google Play')).toHaveCount(0);
  });

  test('has no horizontal overflow across critical widths', async ({ page }) => {
    for (const width of CRITICAL_OVERFLOW_WIDTHS) {
      await withViewport(page, width, async () => {
        await page.goto('/he-IL');
        if (page.url().includes('/setup')) {
          test.skip(true, 'setup environment');
        }
        await expect(page.locator('[data-pf-public-homepage]')).toBeVisible();
        await assertNoPageHorizontalOverflow(page, `homepage@${width}`);
      });
    }
  });

  test('has no horizontal overflow across full screenshot matrix', async ({ page }) => {
    test.setTimeout(300_000);
    for (const width of PAGE_OVERFLOW_WIDTHS) {
      await withViewport(page, width, async () => {
        await page.goto('/he-IL');
        if (page.url().includes('/setup')) {
          test.skip(true, 'setup environment');
        }
        await expect(page.locator('[data-pf-public-homepage]')).toBeVisible();
        await assertNoPageHorizontalOverflow(page, `homepage-full@${width}`);
      });
    }
  });
});
