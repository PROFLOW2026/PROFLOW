import { expect, test } from '@playwright/test';
import { OWNER, SEED_PASSWORD } from '../harness/config';
import { en, he } from '../fixtures/locales';
import { E2E_DESKTOP_VIEWPORT, waitForAuthenticatedShell } from '../fixtures/sign-in';

/**
 * Profile-backed locale persistence for authenticated owners.
 * One focused EN journey + HE sanity — not a full locale matrix.
 */
test.describe('authenticated profile locale persistence', () => {
  test.use({ storageState: 'tests/e2e/.auth/owner.json' });

  test('English profile preference survives refresh and re-login', async ({ page }) => {
    await page.setViewportSize(E2E_DESKTOP_VIEWPORT);
    await page.goto('/he-IL');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();

    await expect(page).toHaveURL(/\/en(\/|$)/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('heading', { name: `Hello ${OWNER.displayName}` }),
    ).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/en(\/|$)/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.getByRole('button', { name: en.common.a11y.userMenu }).click();
    await page.getByRole('menuitem', { name: en.nav.user.signOut }).click();
    await expect(page).toHaveURL(/\/en\/sign-in/);
    await expect(page.getByRole('heading', { name: en.auth.signIn.title })).toBeVisible();

    // Deliberately open Hebrew sign-in — profile locale should win after auth.
    await page.goto('/he-IL/sign-in');
    await page.locator('#sign-in-email').fill(OWNER.email);
    await page.locator('#sign-in-password').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: he.auth.signIn.submit }).click();

    await page.waitForURL((url) => /\/en(\/|$)/.test(url.pathname), { timeout: 45_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(
      page.getByRole('heading', { name: `Hello ${OWNER.displayName}` }),
    ).toBeVisible();
  });

  test('Hebrew session stays he-IL across refresh when not switched', async ({ page }) => {
    await page.setViewportSize(E2E_DESKTOP_VIEWPORT);
    await page.goto('/he-IL');
    await waitForAuthenticatedShell(page);

    await expect(page).toHaveURL(/\/he-IL(\/|$)/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByRole('heading', { name: `שלום ${OWNER.displayName}` }),
    ).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/he-IL(\/|$)/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});
