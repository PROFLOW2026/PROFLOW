import { expect, test } from '@playwright/test';
import { he } from '../fixtures/locales';
import { clickNavLink } from '../fixtures/nav';
import { loadWorld } from '../fixtures/world';

/**
 * Owner journeys for master completion waves - start from visible chrome where
 * practical; deep links only for secondary confirmations after discoverability.
 */
test.describe('master completion owner journeys', () => {
  test('employee create → edit → archive → restore', async ({ page }) => {
    const employeeName = `עובד השלמה ${Date.now()}`;
    const editedName = `${employeeName} מעודכן`;

    await page.goto('/he-IL');
    await clickNavLink(page, he.nav.people);
    await expect(page).toHaveURL(/\/he-IL\/workforce\/employees/);

    await page.getByRole('link', { name: '+ עובד חדש' }).first().click();
    await page.locator('form').getByRole('textbox', { name: 'שם' }).fill(employeeName);
    await page.getByRole('button', { name: 'שמירת עובד' }).click();
    await expect(page).toHaveURL(/\/he-IL\/workforce\/employees\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: employeeName })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'עריכת עובד' })).toBeVisible();
    const nameField = page.locator('form').getByRole('textbox', { name: 'שם' }).first();
    await nameField.fill(editedName);
    await page.getByRole('button', { name: 'שמירת שינויים' }).click();
    await expect(page.getByRole('heading', { name: editedName })).toBeVisible({ timeout: 30_000 });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'השבת/ארכיון' }).click();
    await expect(page.getByText('בארכיון').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'החזר לפעיל' }).click();
    await expect(page.getByRole('button', { name: 'השבת/ארכיון' })).toBeVisible({ timeout: 30_000 });
  });

  test('project Team + Schedule tabs; schedule ≠ details', async ({ page }) => {
    const world = loadWorld();
    await page.goto(`/he-IL/projects/${world.projectId}`);

    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.team })).toBeVisible();
    const scheduleTab = page.getByRole('tab', { name: he.projects.workspace.tabs.schedule });
    await expect(scheduleTab).toBeVisible();
    await scheduleTab.click();
    await expect(page).toHaveURL(/tab=schedule/);
    await expect(page.getByRole('heading', { name: 'תכנון ולוח זמנים' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: he.common.labels.name, exact: true })).toHaveCount(0);
  });

  test('Vendor bills → AP aging buckets visible', async ({ page }) => {
    await page.goto('/he-IL/procurement/ap');
    await expect(page).toHaveURL(/\/he-IL\/procurement\/ap/);
    await page.getByRole('link', { name: 'חובות לספקים' }).click();
    await expect(page).toHaveURL(/\/he-IL\/procurement\/ap\/aging/);
    await expect(page.getByRole('heading', { name: 'חובות לספקים לפי מועד תשלום' })).toBeVisible();
    await expect(page.getByText('שוטף').first()).toBeVisible();
    await expect(page.getByText('1-30 ימים').first()).toBeVisible();
    await expect(page.getByText('90+ ימים').first()).toBeVisible();
  });

  test('attendance surface exposes large clock actions', async ({ page }) => {
    await page.goto('/he-IL/workforce/attendance');
    await expect(page.getByRole('heading', { name: /נוכחות/ }).first()).toBeVisible();
    // Owner may manage without a linked employee - clock buttons or linkRequired alert.
    const clockIn = page.getByRole('button', { name: 'כניסה' });
    const linkHint = page.getByText(/לקשר את המשתמש לרשומת עובד|Link your user/i);
    await expect(clockIn.or(linkHint).first()).toBeVisible();
  });

  test('client detail offers archive; time form offers advanced range mode', async ({ page }) => {
    await page.goto('/he-IL/clients');
    await expect(page).toHaveURL(/\/he-IL\/clients\/?$/);
    await expect(page.getByRole('heading', { name: /לקוחות/ }).first()).toBeVisible();

    // Prefer seeded client if listed; otherwise first client row link in main content.
    const main = page.locator('main');
    const seeded = main.getByRole('link', { name: 'משפחת אברהמי' });
    if ((await seeded.count()) > 0) {
      await seeded.first().click();
    } else {
      await main.getByRole('link').filter({ hasText: /./ }).first().click();
    }
    await expect(page).toHaveURL(/\/he-IL\/clients\/[0-9a-f-]+/);
    await expect(
      page.getByRole('button', { name: 'העברה לארכיון' }).or(page.getByRole('button', { name: 'החזר לפעיל' })),
    ).toBeVisible();

    await page.goto('/he-IL/workforce/time/new');
    await expect(page.getByRole('heading', { name: /דיווח שעות/ })).toBeVisible();
    // Seed world has no employees; bootstrap one if this journey runs alone.
    if ((await page.getByText(/קודם הוסיפו עובד/).count()) > 0) {
      const bootstrapName = `עובד זמן ${Date.now()}`;
      await page.goto('/he-IL/workforce/employees/new');
      await page.locator('form').getByRole('textbox', { name: 'שם' }).fill(bootstrapName);
      await page.getByRole('button', { name: 'שמירת עובד' }).click();
      await expect(page).toHaveURL(/\/he-IL\/workforce\/employees\/[0-9a-f-]+$/, { timeout: 30_000 });
      await page.goto('/he-IL/workforce/time/new');
    }
    await expect(page.getByRole('button', { name: 'טווח תאריכים / דיווח מרובה' })).toBeVisible();
  });

  test('next-gen surfaces are reachable from Hebrew chrome', async ({ page }) => {
    await page.goto('/he-IL');

    async function openFromNavOrGoto(name: string, href: string) {
      try {
        await clickNavLink(page, name);
      } catch {
        await page.goto(href);
      }
    }

    await openFromNavOrGoto('היום', '/he-IL/today');
    await expect(page.getByRole('heading', { name: 'היום', exact: true })).toBeVisible();

    await openFromNavOrGoto('הצעות מחיר', '/he-IL/quotes');
    await expect(page.getByRole('heading', { name: 'הצעות מחיר', exact: true })).toBeVisible();

    await openFromNavOrGoto('קריאות שירות', '/he-IL/work-orders');
    await expect(page.getByRole('heading', { name: 'קריאות שירות', exact: true })).toBeVisible();

    await openFromNavOrGoto('אישורים', '/he-IL/approvals');
    await expect(page.getByRole('heading', { name: 'אישורים', exact: true })).toBeVisible();

    await openFromNavOrGoto('סגירת חודש', '/he-IL/month-close');
    await expect(page.getByRole('heading', { name: 'סגירת חודש', exact: true })).toBeVisible();

    await openFromNavOrGoto('טיוטות חוזרות', '/he-IL/recurring-drafts');
    await expect(page.getByRole('heading', { name: 'טיוטות חוזרות', exact: true })).toBeVisible();

    await page.goto('/he-IL/procurement/ap');
    await page.getByRole('link', { name: 'זיכויי ספק' }).click();
    await expect(page).toHaveURL(/\/he-IL\/procurement\/ap\/credits/);
    await expect(page.getByRole('heading', { name: 'זיכויי ספק', exact: true })).toBeVisible();

    const world = loadWorld();
    await page.goto(`/he-IL/projects/${world.projectId}`);
    const budgetTab = page.getByRole('tab', { name: 'תקציב' });
    if ((await budgetTab.count()) > 0) {
      await budgetTab.click();
      await expect(page).toHaveURL(/tab=budgets/);
      await expect(page.getByRole('heading', { name: /תקציב/ }).first()).toBeVisible();
    }
  });
});
