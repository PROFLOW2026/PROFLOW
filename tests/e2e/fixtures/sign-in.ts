import { expect, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../harness/config';
import { he } from './locales';

/** Desktop viewport so sidebar nav (`lg:flex`) is visible during auth setup. */
export const E2E_DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

/**
 * Owner/worker setup and persona sign-in.
 *
 * Sign-in uses stable `#sign-in-*` ids and controlled React inputs so Playwright
 * `fill()` updates React state (native value setter alone does not).
 */
export async function waitForAuthenticatedShell(page: Page): Promise<void> {
  const shell = page.locator('[data-pf-shell="app"]');
  const nav = page.getByRole('navigation', { name: he.common.a11y.mainNavigation });
  const errorRetry = page.getByRole('button', { name: he.errors.errorPage.retry });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(page).toHaveURL(/\/he-IL(\/?|$)/, { timeout: 30_000 });

    if (/\/onboarding|\/setup/.test(page.url())) {
      await page.goto('/he-IL/');
      continue;
    }

    if (await errorRetry.isVisible().catch(() => false)) {
      await errorRetry.click();
      await page.waitForTimeout(500);
      continue;
    }

    if (await shell.isVisible().catch(() => false)) {
      await expect(nav).toBeVisible({ timeout: 15_000 });
      return;
    }

    await page.goto('/he-IL/');
    await page.waitForTimeout(500);
  }

  await expect(shell).toBeVisible({ timeout: 30_000 });
  await expect(nav).toBeVisible({ timeout: 15_000 });
}

export async function signInThroughForm(
  page: Page,
  email: string,
  { expectDashboard = true }: { expectDashboard?: boolean } = {},
): Promise<void> {
  await page.setViewportSize(E2E_DESKTOP_VIEWPORT);
  await page.goto('/he-IL/sign-in');
  await expect(page.locator('#sign-in-email')).toBeVisible();
  await page.locator('#sign-in-email').fill(email);
  await page.locator('#sign-in-password').fill(SEED_PASSWORD);
  await expect(page.locator('#sign-in-email')).toHaveValue(email);
  await expect(page.locator('#sign-in-password')).toHaveValue(SEED_PASSWORD);
  await page.getByRole('button', { name: he.auth.signIn.submit }).click();

  if (expectDashboard) {
    await waitForAuthenticatedShell(page);
  }
}
