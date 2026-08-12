import { expect, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../harness/config';
import { he } from './locales';

/**
 * Owner/worker setup and persona sign-in.
 *
 * Sign-in uses stable `#sign-in-*` ids and controlled React inputs so Playwright
 * `fill()` updates React state (native value setter alone does not).
 */
export async function signInThroughForm(
  page: Page,
  email: string,
  { expectDashboard = true }: { expectDashboard?: boolean } = {},
): Promise<void> {
  await page.goto('/he-IL/sign-in');
  await expect(page.locator('#sign-in-email')).toBeVisible();
  await page.locator('#sign-in-email').fill(email);
  await page.locator('#sign-in-password').fill(SEED_PASSWORD);
  await expect(page.locator('#sign-in-email')).toHaveValue(email);
  await expect(page.locator('#sign-in-password')).toHaveValue(SEED_PASSWORD);
  await page.getByRole('button', { name: he.auth.signIn.submit }).click();

  if (expectDashboard) {
    await expect(page).toHaveURL(/\/he-IL\/?$/, { timeout: 30_000 });
    await expect(page.getByRole('navigation', { name: he.common.a11y.mainNavigation })).toBeVisible();
  }
}
