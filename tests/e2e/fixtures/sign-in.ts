import { expect, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../harness/config';
import { he } from './locales';

export async function signInThroughForm(
  page: Page,
  email: string,
  { expectDashboard = true }: { expectDashboard?: boolean } = {},
): Promise<void> {
  await page.goto('/he-IL/sign-in');
  await page.getByLabel(he.auth.signIn.email).fill(email);
  await page.getByLabel(he.auth.signIn.password).fill(SEED_PASSWORD);
  await page.getByRole('button', { name: he.auth.signIn.submit }).click();

  if (expectDashboard) {
    await expect(page).toHaveURL(/\/he-IL\/?$/);
    await expect(page.getByRole('navigation', { name: he.common.a11y.mainNavigation })).toBeVisible();
  }
}
