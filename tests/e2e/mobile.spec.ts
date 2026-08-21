import { expect, test } from '@playwright/test';
import {
  assertFabClearsBottomNav,
  assertNoPageHorizontalOverflow,
  MOBILE_NAV,
} from './fixtures/layout';
import { he } from './fixtures/locales';

test.describe('mobile shell', () => {
  test('shows bottom navigation without horizontal overflow', async ({ page }) => {
    await page.goto('/he-IL');

    const bottomNav = page.locator(MOBILE_NAV);
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: he.nav.dashboard })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: he.nav.today })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: he.nav.projects })).toBeVisible();
    // Fourth primary slot varies by persona; More sheet holds overflow destinations.
    await expect(bottomNav.locator('[data-pf-mobile-nav-more]')).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'mobile dashboard');
  });

  test('FAB clears the fixed bottom navigation', async ({ page }) => {
    await page.goto('/he-IL');
    await assertFabClearsBottomNav(page);
  });

  test('reports is reachable and does not overflow horizontally', async ({ page }) => {
    await page.goto('/he-IL/reports');
    await expect(page.getByRole('heading', { name: he.dashboard.reports.title, level: 1 })).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'mobile reports');
    await assertFabClearsBottomNav(page);
  });

  test('keeps quick-create available without a corner FAB on create flows', async ({ page }) => {
    await page.goto('/he-IL/projects/new');

    const toolbarCreate = page.locator('[data-pf-quick-create="toolbar"]');
    await expect(toolbarCreate).toBeVisible();
    await expect(page.locator('[data-pf-quick-create="fab"]')).toHaveCount(0);

    await assertNoPageHorizontalOverflow(page, 'mobile project create');
  });

  test('opens overflow destinations in a bottom sheet dialog', async ({ page }) => {
    await page.goto('/he-IL');

    await page.getByRole('button', { name: he.nav.more }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: he.nav.more })).toBeVisible();
    await expect(dialog.getByRole('link', { name: he.nav.settings })).toBeVisible();

    const sheetPosition = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, viewportHeight: window.innerHeight };
    });

    expect(sheetPosition.bottom).toBeGreaterThanOrEqual(sheetPosition.viewportHeight - 4);
  });
});
