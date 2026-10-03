import { expect, test, type Page } from '@playwright/test';
import {
  E2E_DUAL_EMPLOYEE,
  E2E_SINGLE_EMPLOYEE,
  OWNER,
} from '../harness/config';
import { he } from '../fixtures/locales';
import { signInThroughForm } from '../fixtures/sign-in';

const ORG_A_NAME = 'חשמל דנה בע"מ';
const ORG_B_NAME = 'לוי שיפוצים';

async function employeeLogin(page: Page, username: string, pin: string) {
  await page.goto('/he-IL/employee/login');
  await page.locator('#username').fill(username);
  await page.locator('#pin').fill(pin);
  await page.getByRole('button', { name: he.employeeApp.login.submit }).click();
}

test.describe('employee multi-org browser (launch verification)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('single-org employee login opens employee app', async ({ page }) => {
    await page.context().clearCookies();
    await employeeLogin(page, E2E_SINGLE_EMPLOYEE.username, E2E_SINGLE_EMPLOYEE.pin);
    await expect(page.locator('[data-pf-employee-app]')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(ORG_A_NAME, { exact: false }).first()).toBeVisible();
  });

  test('invalid employee PIN is rejected', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/he-IL/employee/login');
    await page.locator('#username').fill('nouser9999');
    await page.locator('#pin').fill('000000');
    await page.getByRole('button', { name: he.employeeApp.login.submit }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: he.employeeApp.errors.invalidCredentials }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/employee\/login/);
  });

  test('dual-org: employee A → isolation → logout → owner usable', async ({ page }) => {
    // Preferred org B is seeded in harness; browser journey starts at employee login (owner shell optional).
    await page.context().clearCookies();
    await employeeLogin(page, E2E_DUAL_EMPLOYEE.username, E2E_DUAL_EMPLOYEE.pin);
    await expect(page.locator('[data-pf-employee-app]')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(ORG_A_NAME, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(ORG_B_NAME)).toHaveCount(0);

    await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
    await page.getByRole('menuitem', { name: he.employeeApp.signOut }).click();
    await expect(page).toHaveURL(/\/employee\/login/, { timeout: 30_000 });

    await page.context().clearCookies();
    await signInThroughForm(page, OWNER.email);
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible();
    await expect(page.locator('[data-pf-employee-app]')).toHaveCount(0);
  });
});
