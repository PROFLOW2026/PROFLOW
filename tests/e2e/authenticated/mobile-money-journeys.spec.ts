import { expect, test } from '@playwright/test';
import { formatMoney } from '@/shared/money/format';
import { assertNoPageHorizontalOverflow } from '../fixtures/layout';
import { he } from '../fixtures/locales';
import { loadWorld } from '../fixtures/world';

/**
 * R-035 closure proof: core money journeys at phone viewport without a dedicated
 * mobile layout rewrite. Uses existing responsive shell + tab/card patterns.
 */
test.describe('core mobile money journeys (R-035)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const world = loadWorld();
  const seededProjectName = 'שיפוץ דירה ברמת גן';
  const contractValueFormatted = formatMoney({ amount: '150000', currency: 'ILS' }, 'he-IL');

  test('1 · project overview exposes financial truth', async ({ page }) => {
    await page.goto(`/he-IL/projects/${world.projectId}`);
    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();

    await expect(page.getByText(contractValueFormatted).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'סיכום כספי' })).toBeVisible();
    await expect(page.getByText('סכום חוזה נוכחי').first()).toBeVisible();

    await assertNoPageHorizontalOverflow(page, 'project overview mobile');
  });

  test('2 · expense capture remains usable', async ({ page }) => {
    const description = `הוצאת מובייל ${Date.now()}`;

    await page.goto(`/he-IL/expenses/new?projectId=${world.projectId}`);
    await expect(page.getByRole('heading', { name: he.expenses.capture.title, level: 1 })).toBeVisible();

    const amountField = page.getByRole('textbox', { name: he.expenses.fields.amount });
    await expect(amountField).toBeVisible();
    await amountField.fill('1800');

    await page.locator('form').getByRole('textbox', { name: he.expenses.fields.description }).fill(description);

    const saveDraft = page.getByRole('button', { name: he.expenses.actions.saveDraft });
    await expect(saveDraft).toBeVisible();
    const box = await saveDraft.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(44);

    await saveDraft.click();
    await expect(page).toHaveURL(/\/he-IL\/expenses\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(
      page.locator('form').getByRole('textbox', { name: he.expenses.fields.description }),
    ).toHaveValue(description);

    await assertNoPageHorizontalOverflow(page, 'expense capture mobile');
  });

  test('3 · AP vendor bill create path is reachable', async ({ page }) => {
    await page.goto('/he-IL/procurement/ap/new');
    await expect(page.getByRole('heading', { name: 'חשבונית ספק חדשה', level: 1 })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'ספק' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'שמירת טיוטה' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'הוספת שורה' })).toBeVisible();

    await assertNoPageHorizontalOverflow(page, 'AP create mobile');
  });

  test('4 · subcontract and vendor commitment surfaces are visible', async ({ page }) => {
    await page.goto(`/he-IL/vendors/${world.vendorId}`);
    await page.getByRole('tab', { name: 'מסחרי' }).click();
    await expect(page.getByRole('heading', { name: 'הסכמי קבלני משנה' })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expect(page.getByRole('heading', { name: he.financial.panelTitle, level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'עלות ספקים בפרויקט זה' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(he.financial.kpis.committed) }),
    ).toBeVisible();

    await assertNoPageHorizontalOverflow(page, 'vendor commitment mobile');
  });

  test('5 · billing plan create / handoff surfaces load', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`/he-IL/projects/${world.projectId}?tab=billingPlan`);
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.billingPlan })).toHaveAttribute(
      'data-state',
      'active',
    );

    const createPlan = page.getByRole('button', { name: /^יצירת תוכנית$/ });
    const workspace = page.getByTestId('billing-cycle-workspace');
    await expect(createPlan.or(workspace).first()).toBeVisible({ timeout: 20_000 });

    await assertNoPageHorizontalOverflow(page, 'billing plan mobile');
  });

  test('6 · payment and collection visibility', async ({ page }) => {
    await page.goto('/he-IL/billing');
    await expect(page.getByRole('heading', { name: he.billing.title, level: 1 })).toBeVisible();
    await expect(page.getByRole('tablist', { name: he.billing.list.filtersLabel })).toBeVisible();

    const newBilling = page.getByRole('link', { name: he.billing.panel.addBilling });
    const newPayment = page.getByRole('link', { name: he.billing.paymentForm.title });
    const receivables = page.getByText(he.billing.receivables.title);
    const emptyBilling = page.getByText(he.billing.list.emptyTitle);

    await expect(newBilling.or(newPayment).or(receivables).or(emptyBilling).first()).toBeVisible();

    await assertNoPageHorizontalOverflow(page, 'billing collections mobile');
  });

  test('7 · profitability KPI panel is usable', async ({ page }) => {
    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expect(page.getByRole('heading', { name: he.financial.panelTitle, level: 3 })).toBeVisible();

    for (const label of [
      he.financial.kpis.currentContract,
      new RegExp(`^${he.financial.kpis.actualCost}`),
      he.financial.kpis.actualMargin,
    ]) {
      const kpi = page.getByRole('button', { name: label }).first();
      await expect(kpi).toBeVisible();
      const box = await kpi.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThan(40);
    }

    await assertNoPageHorizontalOverflow(page, 'financials KPI mobile');
  });
});
