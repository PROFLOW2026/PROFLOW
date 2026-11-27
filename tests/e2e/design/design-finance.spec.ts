import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { he } from '../fixtures/locales';
import { signInThroughForm } from '../fixtures/sign-in';
import { OWNER } from '../harness/config';

const SHOTS = path.join('tests', 'e2e', 'design', 'screenshots');
const PROFIT = he.dashboard.ownerHeadline.actualProfit;

test.describe('owner finance dashboard on the local harness', () => {
  test.describe.configure({ timeout: 240_000 });
  test.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });

  test('current, v9, and v10 show the same owner figures', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);

    await page.getByRole('combobox', { name: he.nav.experiencePreview.label }).selectOption({
      label: he.nav.experiencePreview.profiles.GENERAL_CONTRACTOR,
    });
    const body = page.locator('[data-pf-design-finance-body]');
    await expect(body.getByText(PROFIT, { exact: true }).first()).toBeVisible({ timeout: 90_000 });

    const currentText = await normalizedText(body);
    const currentMoney = moneyTokens(currentText);
    expect(currentMoney.length).toBeGreaterThan(0);
    await page.screenshot({ path: shot('finance-owner-current-1440.png'), fullPage: true });

    await chooseDesign(page, 'V9');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    await expect(page.locator('[data-pf-design-finance]')).toHaveAttribute('data-pf-design-variant', 'v9');
    expect(await normalizedText(body)).toBe(currentText);
    const financeChrome = page.locator('[data-pf-design-finance]');
    await expect(financeChrome.locator('[data-pf-design-landmark="v9-chart-full"]')).toBeVisible();
    const hero = financeChrome.locator('[data-pf-design-landmark="hero"]');
    if ((await hero.count()) > 0) {
      await expect(hero.getByText('מרווח חוזי', { exact: false })).toBeVisible();
      await expect(hero.getByText('אינו רווח מזומן', { exact: false })).toBeVisible();
    }
    await page.screenshot({ path: shot('finance-owner-v9-1440.png'), fullPage: true });

    await chooseDesign(page, 'V10');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v10');
    expect(await normalizedText(body)).toBe(currentText);
    const finance = page.locator('[data-pf-design-finance]');
    await expect(finance.locator('[data-pf-design-landmark="v10-glance"]')).toBeVisible();
    await expect(finance.locator('[data-pf-design-landmark="v10-chart-beside"]')).toBeVisible();
    await expect(finance.locator('[data-pf-design-landmark="v10-month-detail"], [data-pf-design-chart="empty"]').first()).toBeVisible();
    const urgentItems = finance.locator('[data-pf-design-landmark="v10-urgent"] li');
    expect(await urgentItems.count()).toBeLessThanOrEqual(3);
    await page.screenshot({ path: shot('finance-owner-v10-1440.png'), fullPage: true });

    const profitAmount = (
      await body.getByText(PROFIT, { exact: true }).locator('xpath=following::p[1]').first().innerText()
    ).trim();
    expect(profitAmount).toMatch(/₪|[\d]/);
    await body.getByText(PROFIT, { exact: true }).locator('..').getByRole('button', { name: 'פירוט' }).click();
    const detail = page.getByRole('dialog');
    await expect(detail.locator('p').filter({ hasText: 'אינו רווח מזומן' }).last()).toBeVisible();
    await expect(detail.getByText(profitAmount.replace('₪', '').trim(), { exact: false }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    expect(await normalizedText(body)).toBe(currentText);

    const vatLabel = body.getByText(he.financial.kpis.includingVat, { exact: false });
    if ((await vatLabel.count()) > 0) {
      await expect(vatLabel.first()).toBeVisible();
    }
    const vatToggle = page.getByRole('button', { name: 'מע״מ וברוטו' });
    if (await vatToggle.isVisible().catch(() => false)) {
      await vatToggle.click();
      await expect(page.locator('[data-pf-design-landmark="v10-vat"]')).toBeVisible();
      expect(await normalizedText(body)).toBe(currentText);
    }

    await page.goto('/he-IL?month=2024-01');
    await expect(body.getByText(PROFIT, { exact: false }).first()).toBeVisible({ timeout: 90_000 });
    const januaryText = await normalizedText(body);
    await chooseDesign(page, 'נוכחי');
    expect(await normalizedText(body)).toBe(januaryText);
    await page.goto('/he-IL?month=2024-06');
    await expect(body.getByText(PROFIT, { exact: false }).first()).toBeVisible({ timeout: 90_000 });
    const juneText = await normalizedText(body);
    await chooseDesign(page, 'V9');
    expect(await normalizedText(body)).toBe(juneText);
    test.info().annotations.push({
      type: 'month-filter',
      description:
        januaryText === juneText
          ? 'seed months 2024-01 and 2024-06 rendered the same finance body; design switch kept each month stable'
          : 'seed months 2024-01 and 2024-06 rendered different finance bodies; design switch kept each month stable',
    });

    for (const width of [390, 320] as const) {
      await page.setViewportSize({ width, height: 844 });
      await assertDocumentNotHorizontallyOverflowing(page);
      await page.screenshot({ path: shot(`finance-owner-v9-${width}.png`) });
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

function shot(name: string): string {
  mkdirSync(SHOTS, { recursive: true });
  return path.join(SHOTS, name);
}

function moneyTokens(text: string): string[] {
  return [...text.matchAll(/₪\s*[\d][\d,.]*|[\d][\d,.]*\s*₪/g)].map((match) => match[0].replace(/\s+/g, ''));
}

async function normalizedText(root: ReturnType<Page['locator']>): Promise<string> {
  const text = await root.innerText();
  return text.replace(/\s+/g, ' ').trim();
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

function assertLocalHarness(page: Page): void {
  const host = new URL(page.url()).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('finance spec only runs against the local harness');
  }
}

async function chooseDesign(page: Page, optionLabel: string): Promise<void> {
  const header = page.getByRole('button', { name: 'בחירת מצב תצוגה' });
  if (await header.isVisible().catch(() => false)) {
    await header.click();
  } else {
    await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
  }
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-pf-design',
    optionLabel === 'V9' ? 'v9' : optionLabel === 'V10' ? 'v10' : 'current',
  );
}

async function assertDocumentNotHorizontallyOverflowing(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}
