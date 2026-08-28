import { expect, test, type Page } from '@playwright/test';
import { assertNoPageHorizontalOverflow } from '../fixtures/layout';
import { gotoProjectTab } from '../fixtures/project-workspace';
import { loadWorld } from '../fixtures/world';

const seededProjectName = 'שיפוץ דירה ברמת גן';
const advancedProjectName = 'BOQ Advanced E2E';
const changeProjectName = 'BOQ Change Sub E2E';

const world = loadWorld();

function projectIdForName(projectName: string): string {
  if (projectName === seededProjectName) return world.projectId;
  if (projectName === advancedProjectName) return world.advancedProjectId ?? '';
  if (projectName === changeProjectName) return world.changeProjectId ?? '';
  throw new Error(`Unknown BOQ project: ${projectName}`);
}

async function openProjectBoqTab(page: Page, projectName: string) {
  const projectId = projectIdForName(projectName);
  expect(projectId).toBeTruthy();
  await gotoProjectTab(page, projectId, 'boq');
  await expect(page).toHaveURL(/tab=boq/);
  await expect(page.getByRole('heading', { name: 'כתב כמויות', exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Real BOQ functional happy path via project BOQ tab UI/actions.
 */
test.describe('BOQ functional happy path', () => {
  test('activate → progress → approve → bill → duplicate blocked', async ({ page }) => {
    await openProjectBoqTab(page, seededProjectName);
    await expect(page.getByText(/סעיף בדיקה/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('1.01').first()).toBeVisible({ timeout: 10_000 });

    const activate = page.getByRole('button', { name: /הפעלת בסיס|Activate/i });
    await expect(activate).toBeVisible({ timeout: 10_000 });
    await activate.click();
    await expect(activate).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /שמירת מדידת|Save progress/i })).toBeVisible({
      timeout: 20_000,
    });

    const period = page.locator('input[name="periodLabel"]').first();
    await period.fill('E2E-Period-1');
    const measured = page.getByLabel(/כמות שנמדדה|Measured qty/i).first();
    await measured.fill('4');
    await expect(page.locator('input[name="measuredQuantity"]').first()).toHaveValue('4');
    await page.getByRole('button', { name: /שמירת מדידת|Save progress/i }).click();
    await expect(
      page.getByText(/מדידת ההתקדמות נשמרה|Progress batch saved/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    const approve = page.getByRole('button', { name: /^אישור$|^Approve$/i }).first();
    await expect(approve).toBeVisible({ timeout: 15_000 });
    await approve.click();
    await expect(
      page.getByText(/מדידת ההתקדמות אושרה|Progress batch approved/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    const tax = page.locator('input[name="taxAmount"]').first();
    await expect(tax).toBeVisible({ timeout: 10_000 });
    await tax.fill('18');
    const retention = page.locator('input[name="retentionPercent"]').first();
    await retention.fill('10');
    await page
      .getByRole('button', {
        name: /יצירה ואישור חשבון התקדמות|Create and finalize progress invoice/i,
      })
      .click();
    await expect(
      page
        .getByText(/חשבון ההתקדמות נוצר ואושר|Progress invoice created and finalized/i)
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    await expect(
      page.getByText(/כבר מקושר|already linked|already billed/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await assertNoPageHorizontalOverflow(page, 'BOQ functional happy path');
  });

  test('advanced measured 10 / approved 4', async ({ page }) => {
    await openProjectBoqTab(page, advancedProjectName);
    await expect(page.getByText(/סעיף מתקדם/).first()).toBeVisible({ timeout: 15_000 });

    const activate = page.getByRole('button', { name: /הפעלת בסיס|Activate/i });
    await activate.click();
    await expect(activate).toBeHidden({ timeout: 20_000 });

    await page.locator('input[name="periodLabel"]').first().fill('ADV-1');
    await page.getByLabel(/כמות שנמדדה|Measured qty/i).first().fill('10');
    await page.getByRole('button', { name: /שמירת מדידת|Save progress/i }).click();
    await expect(
      page.getByText(/מדידת ההתקדמות נשמרה|Progress batch saved/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.locator('input[name="approveApprovedQuantity"]').first().fill('4');
    await page.getByRole('button', { name: /^אישור$|^Approve$/i }).first().click();
    await expect(
      page.getByText(/מדידת ההתקדמות אושרה|Progress batch approved/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await assertNoPageHorizontalOverflow(page, 'BOQ advanced approve');
  });

  test('ChangeOrder updates Current while Original stays unchanged', async ({ page }) => {
    await openProjectBoqTab(page, changeProjectName);
    await expect(page.getByText(/סעיף שינוי/).first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/מקורי|Original/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/1,?000/).first()).toBeVisible({ timeout: 10_000 });

    await page.locator('select[name="changeOrderId"]').selectOption({ index: 1 });
    await page.locator('select[name="allocationKind"]').selectOption('quantity_change');
    await page.locator('select[name="boqNodeId"]').selectOption({ index: 1 });
    await page.locator('input[name="quantityDelta"]').fill('5');
    await page.getByRole('button', { name: /^שיוך$|^Allocate$/i }).click();

    await expect(page.getByText(/1,?500/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/1,?000/).first()).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'BOQ change Original/Current');
  });

  test('subcontractor schedule → activate → valuation → approve', async ({ page }) => {
    await openProjectBoqTab(page, changeProjectName);

    await expect(page.locator('h3', { hasText: /לוח כמויות לקבלן משנה/ })).toBeVisible({
      timeout: 15_000,
    });
    const engagement = page.locator('select[name="vendorEngagementId"]').first();
    await expect(engagement).toBeVisible({ timeout: 10_000 });
    await engagement.selectOption({ index: 0 });
    await page.getByRole('button', { name: /יצירת לוח|Create schedule/i }).click();

    const addLine = page.getByRole('button', {
      name: /הוספת שורת עלות|Add (cost )?line/i,
    });
    await expect(addLine).toBeVisible({ timeout: 20_000 });
    await page.locator('input[name="agreedQuantity"]').fill('10');
    await page.locator('input[name="unitRate"]').fill('50');
    await addLine.click();

    const activateSchedule = page.getByRole('button', {
      name: /הפעלת לוח|Activate schedule/i,
    });
    await expect(activateSchedule).toBeEnabled({ timeout: 20_000 });
    await activateSchedule.click();

    const createValuation = page.getByRole('button', {
      name: /יצירת טיוטת הערכה|Create valuation/i,
    });
    await expect(createValuation).toBeVisible({ timeout: 20_000 });

    const periodInputs = page.locator('input[name="periodLabel"]');
    await expect(periodInputs.last()).toBeVisible({ timeout: 15_000 });
    await periodInputs.last().fill('SUB-1');
    const qtyInputs = page.locator('input[name^="qty_"]');
    await expect(qtyInputs.first()).toBeVisible({ timeout: 10_000 });
    await qtyInputs.first().fill('2');
    await createValuation.click();
    await expect(page.getByText(/טיוטת הערכה נשמרה|Valuation draft/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: /אישור הערכה|Approve valuation/i }).click();
    await expect(page.getByText(/ההערכה אושרה|Valuation approved/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await assertNoPageHorizontalOverflow(page, 'BOQ subcontractor flow');
  });
});
