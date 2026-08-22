import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { loadWorld, type SeededWorld } from '../fixtures/world';

function tryLoadWorld(): SeededWorld | null {
  const worldPath = path.resolve(process.cwd(), 'tests/e2e/.world.json');
  if (!existsSync(worldPath)) return null;
  try {
    return loadWorld();
  } catch {
    return null;
  }
}

async function assertHebrewSurface(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\bbillingPlan\.[a-zA-Z]/);
  expect(text).not.toMatch(/\bProgress Account\b/);
  expect(text).not.toMatch(/\bBilling Plan\b/);
  expect(text).not.toMatch(/\bNet\s*30\b/);
}

/**
 * Full Owner journey against the PGlite harness (migrations through 0065).
 * Fails hard if create/issue/print surfaces are missing — no soft tab-label pass.
 */
async function runBillingPlanJourney(page: Page, world: SeededWorld) {
  await page.goto(`/he-IL/projects/${world.projectId}?tab=billingPlan`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 45_000 });
  await assertHebrewSurface(page);

  const panel = page.getByTestId('billing-plan-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });

  const emptyAction = page.getByRole('button', { name: /יצירת תוכנית חיובים/i });
  if (await emptyAction.isVisible()) {
    await emptyAction.click();
    await page.getByTestId('billing-plan-create-mode-simple').click();
    await page.getByRole('button', { name: /יצירת תוכנית/i }).click();
    await expect(panel.getByText(/טיוטה|פעילה|active|draft/i).first()).toBeVisible({
      timeout: 30_000,
    });
  }

  const activate = page.getByRole('button', { name: /^הפעלה$/i });
  if (await activate.isVisible()) {
    await activate.click();
    await expect(page.getByText(/פעילה/i).first()).toBeVisible({ timeout: 20_000 });
  }

  await expect(page.getByTestId('billing-cycle-workspace')).toBeVisible({ timeout: 20_000 });

  const cycleTitle = page.getByLabel(/כותרת חשבון/i);
  await expect(cycleTitle).toBeVisible({ timeout: 15_000 });
  await cycleTitle.fill('חשבון חלקי 1');
  await page.getByRole('button', { name: /^חשבון חלקי חדש$/i }).click();

  await expect(page.getByTestId('cycle-line-editor')).toBeVisible({ timeout: 30_000 });
  const editor = page.getByTestId('cycle-line-editor');
  const desktopPercent = editor.locator('table tbody tr').first().locator('input').first();
  const mobilePercent = editor.locator('.md\\:hidden input').first();
  if (await desktopPercent.isVisible()) {
    await desktopPercent.fill('30');
  } else {
    await mobilePercent.fill('30');
  }
  await editor.getByRole('button', { name: /^שמירת שורות החשבון$/i }).click();
  await expect(editor).toBeVisible();

  const issue = editor.getByRole('button', { name: /^הנפקה כחיוב$/i });
  await expect(issue).toBeVisible({ timeout: 15_000 });
  await issue.click();
  await expect(page.getByText(/הונפק|issued|תשלומים נרשמים בנפרד/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/תשלום נרשם|Payment recorded/i)).toHaveCount(0);
  await assertHebrewSurface(page);

  const printLink = page
    .getByTestId('billing-cycle-workspace')
    .locator('a[href*="/billing-plan/cycles/"][href$="/print"]')
    .first();
  await expect(printLink).toBeVisible({ timeout: 15_000 });
  const [printPage] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null),
    printLink.click(),
  ]);
  const target = printPage ?? page;
  if (printPage) await printPage.waitForLoadState('domcontentloaded');
  await expect(target).toHaveURL(/billing-plan\/cycles\/.+\/print/);
  const printText = await target.locator('body').innerText();
  expect(printText).not.toMatch(/\bbillingPlan\./);
  expect(printText.length).toBeGreaterThan(40);
}

test.describe('Billing plan Owner journey (he-IL desktop)', () => {
  test('create simple plan, bill by %, issue AR without payment, print', async ({ page }) => {
    test.setTimeout(120_000);
    const world = tryLoadWorld();
    test.skip(!world, 'e2e world fixture missing');
    await runBillingPlanJourney(page, world!);
  });
});

test.describe('Billing plan Owner journey (he-IL mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile create/issue/print stays Hebrew', async ({ page }) => {
    test.setTimeout(120_000);
    const world = tryLoadWorld();
    test.skip(!world, 'e2e world fixture missing');
    await runBillingPlanJourney(page, world!);
  });
});
