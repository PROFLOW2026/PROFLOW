import { expect, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../harness/config';
import { he } from './locales';

/** Desktop viewport so sidebar nav (`lg:flex`) is visible during auth setup. */
export const E2E_DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

function isLocaleHome(url: URL): boolean {
  return url.pathname === '/he-IL' || url.pathname === '/he-IL/';
}

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

  // Do not match `/he-IL/sign-in` — pathname must be the locale home exactly.
  await page.waitForURL((url) => isLocaleHome(url) || /\/(onboarding|setup)\/?$/.test(url.pathname), {
    timeout: 45_000,
  });

  if (/\/(onboarding|setup)\/?$/.test(new URL(page.url()).pathname)) {
    await page.goto('/he-IL/');
    await page.waitForURL((url) => isLocaleHome(url), { timeout: 30_000 });
  }

  // One recovery if the first post-auth RSC render hit the error boundary.
  if (await errorRetry.isVisible().catch(() => false)) {
    await errorRetry.click();
    await page.waitForURL((url) => isLocaleHome(url), { timeout: 30_000 });
  }

  // Wait for shell without thrashing navigations (CI aborts in-flight RSC streams).
  await expect(shell).toBeVisible({ timeout: 45_000 });
  await expect(nav).toBeVisible({ timeout: 30_000 });
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
