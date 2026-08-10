import { expect, test } from '@playwright/test';
import {
  assertNoPageHorizontalOverflow,
  MOBILE_NAV,
} from '../fixtures/layout';
import { he } from '../fixtures/locales';
import { loadWorld } from '../fixtures/world';

/**
 * Owner discoverability journeys must start from visible chrome (More / project tabs),
 * never from a deep URL to workforce routes.
 */
test.describe('workforce discoverability (mobile owner)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('More → Employees → New Employee → Assign Project', async ({ page }) => {
    const employeeName = `עובד גילוי ${Date.now()}`;

    await page.goto('/he-IL');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const bottomNav = page.locator(MOBILE_NAV);
    await expect(bottomNav).toBeVisible();
    await bottomNav.getByRole('button', { name: he.nav.more }).click();

    const more = page.getByRole('dialog');
    await expect(more).toBeVisible();
    await expect(more.getByRole('link', { name: he.nav.workforce })).toBeVisible();
    await more.getByRole('link', { name: he.nav.workforce }).click();

    await expect(page).toHaveURL(/\/he-IL\/workforce\/employees/);
    await expect(page.getByRole('heading', { name: he.nav.workforce, level: 1 })).toBeVisible();
    const newEmployeeCta = page.getByRole('link', { name: '+ עובד חדש' }).first();
    await expect(newEmployeeCta).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'employees list mobile');

    await newEmployeeCta.click();
    await expect(page).toHaveURL(/\/he-IL\/workforce\/employees\/new/);

    const nameField = page.locator('form').getByRole('textbox', { name: 'שם' });
    await expect(nameField).toBeVisible();
    await nameField.fill(employeeName);
    await page.getByRole('button', { name: 'שמירת עובד' }).click();

    await expect(page).toHaveURL(/\/he-IL\/workforce\/employees\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: employeeName })).toBeVisible();
    await expect(page.getByRole('heading', { name: /שיוכים/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'הוסף שיוך' })).toBeVisible();

    await page.getByRole('button', { name: 'הוסף שיוך' }).click();
    await expect(page.getByRole('button', { name: 'שמירת שיוך' })).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'employee assign mobile');
  });

  test('Project → Team → Add Employee CTA is visible from project chrome', async ({ page }) => {
    const world = loadWorld();

    await page.goto('/he-IL');
    const bottomNav = page.locator(MOBILE_NAV);
    await bottomNav.getByRole('link', { name: he.nav.projects }).click();
    await expect(page).toHaveURL(/\/he-IL\/projects/);

    await page.getByRole('link', { name: 'שיפוץ דירה ברמת גן' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/he-IL/projects/${world.projectId}`));

    const teamTab = page.getByRole('tab', { name: he.projects.workspace.tabs.team });
    await expect(teamTab).toBeVisible();
    await teamTab.click();

    await expect(page.getByRole('heading', { name: 'צוות' })).toBeVisible();
    await expect(page.getByText('הוסף עובד').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /\+?\s*עובד חדש/ })).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'project team mobile');
  });
});
