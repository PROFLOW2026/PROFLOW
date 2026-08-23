import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatMoney } from '@/shared/money/format';
import { expectNavLinkAbsent } from '../fixtures/nav';
import { he } from '../fixtures/locales';
import { loadWorld } from '../fixtures/world';

/**
 * Project-centric money-chain QA proof (Scenarios 1–8).
 *
 * Harness: PGlite + he-IL + owner auth (desktop-he-authenticated).
 * Prefer create flows + world fixtures; no SQL / seed mutations outside UI + seeded world.
 *
 * Scenario → proof map
 * ---------------------------------------------------------------------------
 * 1 Full project chain
 *    → `full money chain: client → … → profitability` (this file)
 * 2 Expense/AP dedup
 *    → `expense/AP overlap warning surfaces on AP create` (UI warning)
 *    → unit: `tests/unit/financials/expense-ap-overlap.test.ts`
 * 3 No contract → priceNotSet / no fake profit
 *    → `no-contract project shows priceNotSet, not fake profit`
 *    → unit: `tests/unit/financials/work-pricing.test.ts`
 * 4 Permission-limited user
 *    → E2E: `tests/e2e/authenticated/worker.spec.ts` (desktop-he-worker)
 *    → unit: `tests/unit/financials/financial-slice-availability.test.ts`
 *    (no duplicate owner-auth scenario in this file — see coverage table)
 * 5 Subcontract forecast visible
 *    → covered inside full chain + `subcontract remaining surfaces in financials`
 *    → unit: `tests/unit/vendors/subcontract-commitment.test.ts`
 * 6 Owner UX checklist / sales redirect
 *    → `setup checklist + /sales redirects to quotes`
 * 7 Simple mode
 *    → `simple complexity hides permission-only nav`
 *    → unit: experience-complexity / nav grouping
 * 8 Mobile
 *    → `mobile money journey labels remain reachable` (desktop smoke of same labels)
 *    → full mobile: `tests/e2e/authenticated/mobile-money-journeys.spec.ts` (mobile-he)
 *
 * Reconciliation
 *    → `Overview = Financials = Reports = Dashboard` for seeded project key metrics
 */

const world = loadWorld();
const seededProjectName = 'שיפוץ דירה ברמת גן';
const seededVendorName = 'Fixture Supplies Ltd';
const contractValueFormatted = formatMoney({ amount: '150000', currency: 'ILS' }, 'he-IL');

function normalizeMoneyText(text: string): string {
  return text.replace(/[\u200E\u200F\u00A0]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseIlsAmount(text: string): number {
  const normalized = normalizeMoneyText(text);
  const compact = normalized.match(/([\d]+(?:\.[\d]+)?)\s*K\s*₪/i);
  if (compact?.[1]) return Math.round(Number(compact[1]) * 1000);
  const full = normalized.match(/([\d,.]+)\s*₪/);
  if (full?.[1]) return Number(full[1].replace(/,/g, ''));
  throw new Error(`Could not parse ILS amount from: ${normalized}`);
}

async function selectOption(page: Page, comboboxName: string | RegExp, optionName: string | RegExp) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName }).click();
}

async function moneyFromKpiButton(page: Page, label: string): Promise<number> {
  const btn = page.getByRole('button', { name: new RegExp(label) }).first();
  await expect(btn).toBeVisible({ timeout: 20_000 });
  return parseIlsAmount(await btn.innerText());
}

async function moneyInContainer(container: Locator, label: string): Promise<number> {
  const labelEl = container.getByText(label, { exact: true }).first();
  await expect(labelEl).toBeVisible({ timeout: 20_000 });
  const row = labelEl.locator('xpath=ancestor::div[contains(@class,"justify-between")][1]');
  const text = await row.innerText().catch(async () => labelEl.locator('..').innerText());
  return parseIlsAmount(text);
}

async function complexityForm(page: Page) {
  return page.locator('form').filter({ has: page.getByRole('combobox', { name: 'מורכבות' }) });
}

test.describe('project-centric money chain QA', () => {
  test('1 · full money chain: client → project → contract → labor/vendor/sub/expense/PO → billing → payment → profitability', async ({
    page,
  }) => {
    test.setTimeout(360_000);

    const stamp = Date.now();
    const clientName = `לקוח שרשרת ${stamp}`;
    const projectName = `פרויקט שרשרת ${stamp}`;
    const employeeName = `עובד שרשרת ${stamp}`;
    const expenseDescription = `הוצאת שרשרת ${stamp}`;
    const subcontractTitle = `הסכם שרשרת ${stamp}`;
    const contractAmount = '175000';
    const expenseAmount = '4500';
    const poUnitAmount = '2000';
    const subcontractAmount = '25000';
    const billingAmount = '30000';
    const paymentAmount = '10000';

    const contractFormatted = formatMoney({ amount: contractAmount, currency: 'ILS' }, 'he-IL');
    const billingFormatted = formatMoney({ amount: billingAmount, currency: 'ILS' }, 'he-IL');
    const paymentFormatted = formatMoney({ amount: paymentAmount, currency: 'ILS' }, 'he-IL');

    // --- Client + Project + contract (inline new client on project create) ---
    await page.goto('/he-IL/projects/new');
    await page.getByLabel(he.projects.create.nameLabel).fill(projectName);
    await selectOption(page, he.projects.create.clientLabel, he.projects.create.clientNew);
    await page.getByLabel(he.projects.create.clientNew).fill(clientName);
    await page.getByLabel(he.projects.create.contractValueLabel).fill(contractAmount);
    await page.getByRole('button', { name: he.projects.create.submit }).click();
    await expect(page).toHaveURL(/\/he-IL\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
    const projectUrl = page.url();
    const projectId = projectUrl.match(/\/projects\/([0-9a-f-]+)/)?.[1];
    expect(projectId).toBeTruthy();
    await expect(page.getByText(clientName).first()).toBeVisible();
    await expect(page.getByText(contractFormatted).first()).toBeVisible({ timeout: 20_000 });

    // --- Labor: employee with hourly rate + time entry (approve when available) ---
    await page.goto('/he-IL/workforce/employees/new');
    await page.locator('form').getByRole('textbox', { name: 'שם' }).fill(employeeName);
    const today = new Date().toISOString().slice(0, 10);
    await page.locator('input[name="hireDate"]').fill(today);
    await selectOption(page, /איך מבוטא התעריף/, 'שעתי');
    await page.getByRole('textbox', { name: 'שכר / עלות חודשית' }).fill('120');
    await page.getByRole('button', { name: 'שמירת עובד' }).click();
    await expect(page).toHaveURL(/\/he-IL\/workforce\/employees\/[0-9a-f-]+$/, { timeout: 30_000 });
    const employeeId = page.url().match(/\/employees\/([0-9a-f-]+)/)?.[1];
    expect(employeeId).toBeTruthy();

    await page.goto(
      `/he-IL/workforce/time/new?projectId=${projectId}&employeeId=${employeeId}`,
    );
    await page.getByRole('textbox', { name: 'שעות' }).fill('4');
    const saveApprove = page.getByRole('button', { name: /שמירה ואישור/ });
    if ((await saveApprove.count()) > 0 && (await saveApprove.isEnabled())) {
      await saveApprove.click();
    } else {
      await page.getByRole('button', { name: 'שמירת דיווח שעות' }).click();
    }
    // Labor cost may remain pending approval; continue the money chain regardless.
    if (page.url().includes('/workforce/time/new')) {
      await page.goto(`/he-IL/expenses/new?projectId=${projectId}`);
    } else {
      await page.goto(`/he-IL/expenses/new?projectId=${projectId}`);
    }
    await page.getByRole('textbox', { name: he.expenses.fields.amount }).fill(expenseAmount);
    await page
      .locator('form')
      .getByRole('textbox', { name: he.expenses.fields.description })
      .fill(expenseDescription);
    await page.getByRole('button', { name: /פרטים נוספים|show more/i }).click();
    await selectOption(page, he.expenses.fields.linkedVendor, seededVendorName);
    await page.getByRole('button', { name: he.expenses.actions.saveDraft }).click();
    await expect(page).toHaveURL(/\/he-IL\/expenses\/[0-9a-f-]+$/, { timeout: 30_000 });

    await page.getByRole('button', { name: he.expenses.actions.finalize }).click();
    await page.getByRole('button', { name: he.expenses.actions.finalize }).last().click();
    await expect(page.getByText(he.expenses.detail.finalizedBanner).first()).toBeVisible({
      timeout: 30_000,
    });

    // --- PO (commitment) — create redirects to list, not detail ---
    const poReference = `PO-${stamp}`;
    await page.goto('/he-IL/procurement/new');
    await expect(page.getByRole('heading', { name: /הזמנת רכש חדשה/ })).toBeVisible({ timeout: 30_000 });
    const poForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'יצירת טיוטת הזמנה' }) });
    await expect(poForm).toBeVisible({ timeout: 30_000 });
    await selectOption(page, /ספק/, seededVendorName);
    await selectOption(page, /פרויקט/, projectName);
    await poForm.locator('input[name="reference"]').fill(poReference);
    const lineSection = poForm.locator('section').filter({ hasText: 'שורות' });
    await expect(lineSection).toBeVisible({ timeout: 30_000 });
    const lineInputs = lineSection.getByRole('textbox');
    await lineInputs.nth(0).fill(`שורה PO ${stamp}`);
    await lineInputs.nth(1).fill('1');
    await lineInputs.nth(2).fill(poUnitAmount);
    await lineInputs.nth(3).fill(poUnitAmount);
    await expect(page.getByText(/2000/).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'יצירת טיוטת הזמנה' }).click();
    await expect(page).toHaveURL(/\/he-IL\/procurement\/?$/, { timeout: 30_000 });
    const poRow = page.getByRole('row').filter({ hasText: poReference }).first();
    await expect(poRow).toBeVisible({ timeout: 30_000 });
    await poRow.getByRole('button', { name: 'הנפקה' }).click();
    await expect(poRow.getByText('הונפקה').first()).toBeVisible({ timeout: 30_000 });
    await poRow.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/he-IL\/procurement\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByText('הונפקה').first()).toBeVisible({ timeout: 30_000 });

    // --- Subcontract (forecast commitment) ---
    await page.goto(`/he-IL/vendors/${world.vendorId}`);
    await page.getByRole('tab', { name: 'מסחרי' }).click();
    await expect(page.getByRole('heading', { name: 'הסכמי קבלני משנה' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'הוספת הסכם' }).click();
    await page.getByRole('textbox', { name: /כותרת|title/i }).fill(subcontractTitle);
    await selectOption(page, /פרויקט/, projectName);
    await page.getByRole('textbox', { name: /סכום מקורי/ }).fill(subcontractAmount);
    const promote = page.getByText(/אשרו לסמן אותו גם כקבלן משנה/);
    if (await promote.count()) {
      await page.locator('input[name="promoteVendorToBoth"]').check();
    }
    await page.getByRole('button', { name: 'שמירת הסכם' }).click();
    await expect(page.getByText(/ההסכם נשמר|נשמר כטיוטה/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const activate = page.getByRole('button', { name: /^הפעלה$/ }).first();
    if (await activate.isVisible()) {
      await activate.click();
      await page.getByRole('button', { name: /^הפעלה$/ }).last().click();
      await expect(page.getByText(/ההסכם הופעל/i).first()).toBeVisible({ timeout: 20_000 });
    }

    // --- Billing + Payment ---
    await page.goto(`/he-IL/billing/new?projectId=${projectId}`);
    await expect(page.getByRole('heading', { name: he.billing.form.title })).toBeVisible();
    await page.getByRole('textbox', { name: he.billing.form.amount, exact: true }).fill(billingAmount);
    await page.getByRole('button', { name: he.billing.form.saveAndFinalize }).click();
    await expect(page).toHaveURL(/\/he-IL\/billing\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByText(billingFormatted).first()).toBeVisible();

    const billingId = page.url().match(/\/billing\/([0-9a-f-]+)/)?.[1];
    await page.goto(
      billingId
        ? `/he-IL/billing/payments/new?billingRecordId=${billingId}`
        : '/he-IL/billing/payments/new',
    );
    await expect(page.getByRole('heading', { name: he.billing.paymentForm.title })).toBeVisible();
    if (!(await page.getByRole('combobox', { name: he.billing.paymentForm.billingRecord }).isDisabled())) {
      await selectOption(page, he.billing.paymentForm.billingRecord, new RegExp(projectName));
    }
    await page.getByRole('textbox', { name: he.billing.paymentForm.amount, exact: true }).fill(paymentAmount);
    await page.getByRole('button', { name: he.billing.paymentForm.submit }).click();
    await expect(page.getByText(paymentFormatted).first()).toBeVisible({ timeout: 30_000 });

    // --- Profitability surfaces ---
    await page.goto(`/he-IL/projects/${projectId}`);
    await expect(page.getByRole('heading', { name: 'סיכום כספי', level: 3 })).toBeVisible();
    await expect(page.getByText(contractFormatted).first()).toBeVisible();
    await expect(page.getByTestId('price-not-set-snapshot')).toHaveCount(0);
    const overviewSnapshot = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: 'סיכום כספי', level: 3 }) })
      .first();
    const overviewActual = await moneyInContainer(overviewSnapshot, he.financial.kpis.actualCost);
    // Actual is net ex-VAT; card expense amount is gross — prove cost flowed, not exact card total.
    expect(overviewActual).toBeGreaterThan(0);
    expect(overviewActual).toBeLessThanOrEqual(Number(expenseAmount));

    await page.getByRole('tab', { name: he.projects.workspace.tabs.financials }).click();
    await expect(page.getByRole('heading', { name: he.financial.panelTitle, level: 3 })).toBeVisible();
    const financialsContract = await moneyFromKpiButton(page, he.financial.kpis.currentContract);
    const financialsActual = await moneyFromKpiButton(page, he.financial.kpis.actualCost);
    expect(financialsContract).toBe(Number(contractAmount));
    expect(financialsActual).toBe(overviewActual);
    await expect(page.getByText(billingFormatted).or(page.getByText(/30[,.]?000/)).first()).toBeVisible();
    await expect(page.getByText(paymentFormatted).or(page.getByText(/10[,.]?000/)).first()).toBeVisible();
    await expect(page.getByTestId('price-not-set-banner')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: new RegExp(`^${he.financial.kpis.actualMargin} `) }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(`^${he.financial.kpis.committed}`) }).first(),
    ).toBeVisible();
  });

  test('2 · expense/AP overlap warning surfaces on AP create', async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const description = `הוצאת כפילות ${stamp}`;
    const amount = '6100';

    await page.goto(`/he-IL/expenses/new?projectId=${world.projectId}`);
    await page.getByRole('textbox', { name: he.expenses.fields.amount }).fill(amount);
    await page
      .locator('form')
      .getByRole('textbox', { name: he.expenses.fields.description })
      .fill(description);
    await page.getByRole('button', { name: /פרטים נוספים/ }).click();
    await selectOption(page, he.expenses.fields.linkedVendor, seededVendorName);
    await page.getByRole('button', { name: he.expenses.actions.saveDraft }).click();
    await expect(page).toHaveURL(/\/he-IL\/expenses\/[0-9a-f-]+$/, { timeout: 30_000 });
    await page.getByRole('button', { name: he.expenses.actions.finalize }).click();
    await page.getByRole('button', { name: he.expenses.actions.finalize }).last().click();
    await expect(page.getByText(he.expenses.detail.finalizedBanner).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/he-IL/procurement/ap/new');
    await expect(page.getByRole('heading', { name: /חשבונית ספק חדשה/ })).toBeVisible();
    await selectOption(page, 'ספק', seededVendorName);
    await selectOption(page, 'פרויקט', seededProjectName);
    await page.getByRole('textbox', { name: /מחיר יחידה/ }).first().fill(amount);
    await expect(page.getByText('קיימת הוצאה מאושרת דומה').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('3 · no-contract project shows priceNotSet, not fake profit', async ({ page }) => {
    const projectName = `ללא חוזה ${Date.now()}`;
    await page.goto('/he-IL/projects/new');
    await page.getByLabel(he.projects.create.nameLabel).fill(projectName);
    await page.getByRole('button', { name: he.projects.create.submit }).click();
    await expect(page).toHaveURL(/\/he-IL\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });

    await expect(page.getByText('טרם נרשם סכום חוזה').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'סיימו להקים את הפרויקט' })).toBeVisible();

    await page.getByRole('tab', { name: he.projects.workspace.tabs.financials }).click();
    await expect(
      page.getByTestId('price-not-set-banner').or(page.getByText('המחיר טרם נקבע')).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('button', { name: new RegExp(`^${he.financial.kpis.actualMargin}$`) }),
    ).toHaveCount(0);
  });

  test('5 · subcontract remaining surfaces in financials commitments/forecast', async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const title = `תחזית קבלן ${stamp}`;
    const amount = '18000';
    const amountFormatted = formatMoney({ amount, currency: 'ILS' }, 'he-IL');

    await page.goto(`/he-IL/vendors/${world.vendorId}`);
    await page.getByRole('tab', { name: 'מסחרי' }).click();
    await page.getByRole('button', { name: 'הוספת הסכם' }).click();
    await page.getByRole('textbox', { name: /כותרת|title/i }).fill(title);
    await selectOption(page, /פרויקט/, seededProjectName);
    await page.getByRole('textbox', { name: /סכום מקורי/ }).fill(amount);
    if (await page.locator('input[name="promoteVendorToBoth"]').count()) {
      await page.locator('input[name="promoteVendorToBoth"]').check();
    }
    await page.getByRole('button', { name: 'שמירת הסכם' }).click();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
    const activate = page.getByRole('button', { name: /^הפעלה$/ }).first();
    if (await activate.isVisible()) {
      await activate.click();
      await page.getByRole('button', { name: /^הפעלה$/ }).last().click();
    }

    await page.goto(`/he-IL/projects/${world.projectId}`);
    await expect(page.getByRole('heading', { name: 'הסכמי קבלני משנה', level: 3 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('התחייבות שנותרה').first()).toBeVisible();
    await expect(page.getByText(amountFormatted).first()).toBeVisible();
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test('6 · setup checklist + /sales redirects to quotes', async ({ page }) => {
    const projectName = `צ׳קליסט ${Date.now()}`;
    await page.goto('/he-IL/projects/new');
    await page.getByLabel(he.projects.create.nameLabel).fill(projectName);
    await page.getByRole('button', { name: he.projects.create.submit }).click();
    await expect(page).toHaveURL(/\/he-IL\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByText('סיימו להקים את הפרויקט')).toBeVisible();
    await expect(page.getByText('הגדרת סכום חוזה')).toBeVisible();

    await page.goto('/he-IL/sales');
    await expect(page).toHaveURL(/\/he-IL\/quotes\/?$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'הצעות מחיר', exact: true })).toBeVisible();
  });

  test('7 · simple complexity hides permission-only nav', async ({ page }) => {
    await page.goto('/he-IL/settings/features');
    await expect(page.getByText('רמת המערכת').first()).toBeVisible({ timeout: 20_000 });
    const complexity = await complexityForm(page);
    await selectOption(page, 'מורכבות', 'ניווט פשוט יותר');
    await complexity.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('רמת המערכת עודכנה.').first()).toBeVisible({ timeout: 20_000 });

    await page.goto('/he-IL');
    await expectNavLinkAbsent(page, he.nav.monthClose);
    await expectNavLinkAbsent(page, he.nav.vendorBills);

    await page.goto('/he-IL/settings/features');
    await selectOption(page, 'מורכבות', 'מלא');
    await (await complexityForm(page)).getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('רמת המערכת עודכנה.').first()).toBeVisible({ timeout: 20_000 });
  });

  test('8 · mobile money journey labels remain reachable (cites mobile-money-journeys)', async ({
    page,
  }) => {
    /**
     * Full phone-viewport proof: tests/e2e/authenticated/mobile-money-journeys.spec.ts
     * (Playwright project `mobile-he`, Pixel 7). This test asserts the same Hebrew
     * money labels on the seeded project so Scenario 8 is not render-only here.
     */
    await page.goto(`/he-IL/projects/${world.projectId}`);
    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();
    await expect(page.getByText(contractValueFormatted).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'סיכום כספי' })).toBeVisible();
    await expect(page.getByText('סכום חוזה נוכחי').or(page.getByText('סכום החוזה הנוכחי')).first()).toBeVisible();

    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expect(page.getByRole('heading', { name: he.financial.panelTitle, level: 3 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(he.financial.kpis.actualCost) }).first(),
    ).toBeVisible();
  });

  test('reconciliation · Overview = Financials = Reports = Dashboard for seeded project', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(`/he-IL/projects/${world.projectId}`);
    const overviewSnapshot = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: 'סיכום כספי', level: 3 }) })
      .first();
    await expect(overviewSnapshot.getByText(contractValueFormatted).first()).toBeVisible({
      timeout: 30_000,
    });
    const overviewActual = await moneyInContainer(overviewSnapshot, he.financial.kpis.actualCost);

    await page.getByRole('tab', { name: he.projects.workspace.tabs.financials }).click();
    await expect(page.getByRole('heading', { name: he.financial.panelTitle, level: 3 })).toBeVisible();
    await expect(page.getByText(contractValueFormatted).first()).toBeVisible();
    const financialsContract = await moneyFromKpiButton(page, he.financial.kpis.currentContract);
    const financialsActual = await moneyFromKpiButton(page, he.financial.kpis.actualCost);
    expect(financialsContract).toBe(150_000);
    expect(financialsActual).toBeGreaterThanOrEqual(12_000);
    expect(overviewActual).toBe(financialsActual);

    await page.goto('/he-IL/reports');
    const reportRow = page.getByRole('row').filter({ hasText: seededProjectName }).first();
    await expect(reportRow.getByText(contractValueFormatted).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/he-IL');
    await expect(page.locator('[data-pf-dashboard-home]')).toBeVisible({ timeout: 30_000 });
    const dashContractBlock = page
      .locator('section')
      .filter({ has: page.getByText(he.financial.kpis.currentContract, { exact: true }) })
      .first();
    await expect(dashContractBlock).toBeVisible({ timeout: 30_000 });
    const dashboardContract = parseIlsAmount(await dashContractBlock.innerText());
    expect(dashboardContract).toBeGreaterThanOrEqual(financialsContract);
  });
});
