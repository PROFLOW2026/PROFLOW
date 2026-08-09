import { expect, test } from '@playwright/test';
import { he } from './fixtures/locales';

test.describe('mobile shell', () => {
  test('shows bottom navigation without horizontal overflow', async ({ page }) => {
    await page.goto('/he-IL');

    const bottomNav = page.locator('nav.fixed.inset-x-0.bottom-0');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: he.nav.dashboard })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: he.nav.projects })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: he.nav.expenses })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
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
