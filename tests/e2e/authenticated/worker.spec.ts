import { expect, test } from '@playwright/test';
import { formatMoney } from '@/shared/money/format';
import { he } from '../fixtures/locales';
import { loadWorld } from '../fixtures/world';

const world = loadWorld();
const seededProjectName = 'שיפוץ דירה ברמת גן';
const contractValueFormatted = formatMoney({ amount: '150000', currency: 'ILS' }, 'he-IL');

test.describe('worker permission gating', () => {
  test('hides capabilities the worker lacks from navigation', async ({ page }) => {
    await page.goto('/he-IL');

    const nav = page.getByRole('navigation', { name: he.common.a11y.mainNavigation });
    await expect(nav.getByRole('link', { name: he.nav.dashboard })).toBeVisible();
    await expect(nav.getByRole('link', { name: he.nav.projects })).toBeVisible();
    await expect(nav.getByRole('link', { name: he.nav.expenses })).toBeVisible();
    await expect(nav.getByRole('link', { name: he.nav.settings })).toBeVisible();
    // Attendance-only self clock is allowed for workers.
    await expect(nav.getByRole('link', { name: he.nav.attendance })).toBeVisible();

    await expect(nav.getByRole('link', { name: he.nav.billing })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: he.nav.changes })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: he.nav.clients })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: he.nav.vendors })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: he.nav.workforce })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: he.nav.vendorBills })).toHaveCount(0);
    // Documents module is enabled in the e2e seed; workers keep DOCUMENTS_READ.
    await expect(nav.getByRole('link', { name: he.nav.documents })).toBeVisible();
  });

  test('attendance page is reachable without financial surfaces', async ({ page }) => {
    await page.goto('/he-IL/workforce/attendance');
    await expect(page.getByRole('heading', { name: /נוכחות/ }).first()).toBeVisible();
    // Unlinked worker still sees the page (empty / link required) - not a crash.
    await expect(page.getByText(/עלות בפועל|רווח|חשבונות ספקים/).first()).toHaveCount(0);
    await page.goto('/he-IL/procurement/ap');
    await expect(page.getByRole('heading', { name: 'אין הרשאה' })).toBeVisible();
  });

  test('project workspace omits financial tabs and contract totals', async ({ page }) => {
    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);

    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.financials })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.expenses })).toBeVisible();
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.details })).toBeVisible();
    await expect(page.getByText(contractValueFormatted)).toHaveCount(0);
  });

  test('blocks direct navigation to forbidden settings sections', async ({ page }) => {
    await page.goto('/he-IL/settings/people');
    await expect(page.getByRole('heading', { name: he.settings.notAllowed.title, level: 3 })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: he.settings.notAllowed.title, level: 3 }).locator('..').getByText(he.settings.notAllowed.body),
    ).toBeVisible();
    await expect(page.getByText('דנה כהן')).toHaveCount(0);

    await page.goto('/he-IL/settings/activity');
    await expect(page.getByRole('heading', { name: he.settings.notAllowed.title, level: 3 })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: he.settings.activity.columnWhen })).toHaveCount(0);
  });

  test('cannot create projects from the list page or form submit', async ({ page }) => {
    await page.goto('/he-IL/projects');
    await expect(page.getByRole('link', { name: he.projects.newProject })).toHaveCount(0);

    await page.goto('/he-IL/projects/new');
    await page.getByLabel(he.projects.create.nameLabel).fill('ניסיון עובד');
    await page.getByRole('button', { name: he.projects.create.submit }).click();
    await expect(page.getByRole('alert').filter({ hasText: he.errors.notAllowed })).toBeVisible();
  });

  test('blocks direct navigation to billing data', async ({ page }) => {
    await page.goto('/he-IL/billing');

    await expect(
      page.getByRole('heading', { name: he.billing.notAllowed.title, level: 3 }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('heading', { name: he.billing.notAllowed.title, level: 3 })
        .locator('..')
        .getByText(he.billing.notAllowed.body),
    ).toBeVisible();

    // The refusal is rendered inside the ordinary page frame, so the page title
    // is present by design. Only the absence of billing data proves the gate.
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(
      page.getByRole('columnheader', { name: he.billing.list.reference }),
    ).toHaveCount(0);
  });
});
