import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { he } from './fixtures/locales';

/**
 * Smoke coverage that holds regardless of whether the environment has Supabase
 * and a database wired up. Flows that need real data live in the seeded specs
 * and skip themselves when credentials are absent.
 */

test.describe('locale routing and direction', () => {
  test('serves Hebrew right-to-left by default', async ({ page }) => {
    await page.goto('/he-IL/sign-in');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'he');
    await expect(page.locator('body')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'כניסה' })).toBeVisible();
  });

  test('serves English left-to-right at the same route', async ({ page }) => {
    await page.goto('/en/sign-in');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(page.locator('body')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('redirects a bare path to a locale-prefixed one', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/(he-IL|en)\/sign-in/);
  });
});

test.describe('unauthenticated access', () => {
  test('never renders the application shell on the public homepage', async ({ page }) => {
    await page.goto('/he-IL');

    // Unconfigured environments still go to setup; otherwise the public homepage.
    const url = page.url();
    if (url.includes('/setup')) {
      await expect(page).toHaveURL(/\/he-IL\/setup/);
    } else {
      await expect(page).toHaveURL(/\/he-IL\/?$/);
      await expect(
        page.getByRole('heading', { level: 1, name: he.marketing.hero.title }),
      ).toBeVisible();
      await expect(page.locator('[data-pf-public-homepage]')).toBeVisible();
      await expect(page.locator('[data-pf-shell="app"]')).toHaveCount(0);
    }

    await expect(page.getByRole('navigation', { name: 'ניווט ראשי' })).toHaveCount(0);
  });

  test('product routes still redirect anonymous users to sign-in or setup', async ({ page }) => {
    await page.goto('/he-IL/projects/new');
    await expect(page).toHaveURL(/\/he-IL\/(sign-in|setup|onboarding)/);
    await expect(page.locator('[data-pf-shell="app"]')).toHaveCount(0);
  });

  test('shows a clear, calm explanation when nothing is configured yet', async ({ page }) => {
    const response = await page.goto('/he-IL/setup');
    if (!response?.ok()) test.skip(true, 'setup route unavailable');
    await expect(page.getByRole('status')).toBeVisible();
  });
});

test.describe('sign-in form', () => {
  test('marks both credential fields as required and keeps email left-to-right', async ({ page }) => {
    await page.goto('/he-IL/sign-in');

    const email = page.getByLabel(/אימייל/);
    await expect(email).toHaveAttribute('required', '');
    await expect(email).toHaveAttribute('dir', 'ltr');
    await expect(page.getByLabel(/סיסמה/)).toHaveAttribute('required', '');
  });

  test('offers account recovery and account creation', async ({ page }) => {
    await page.goto('/he-IL/sign-in');
    await expect(page.getByRole('link', { name: 'שכחתם סיסמה?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'יצירת חשבון' })).toBeVisible();
  });

  test('has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/he-IL/sign-in');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
