import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { he } from '../fixtures/locales';
import { E2E_GC_CONTRACTOR, SEED_PASSWORD } from '../harness/config';

const DESIGN_SWITCHER = 'בחירת מצב תצוגה';
const FORM_PROBE = 'ערך שנשמר במעבר עיצוב';
const SHOTS = path.join('tests', 'e2e', 'design', 'screenshots');
const PORTAL = '[data-pf-contractor-portal]';

test.describe('contractor portal design matrix on local harness (he-IL)', () => {
  test.describe.configure({ timeout: 240_000 });
  test.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });

  test('current, V9, and V10 stay inside the contractor portal without finance leakage', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().clearCookies();

    await page.goto('/he-IL/contractor/sign-in');
    assertLocalHarness(page);
    await page.locator('#contractor-username').fill(E2E_GC_CONTRACTOR.username);
    await page.locator('#contractor-password').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'כניסה' }).click();
    await page.waitForURL(/\/contractor\/?$/, { timeout: 45_000 });

    const portal = page.locator(PORTAL);
    await expect(portal).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-pf-design-scope="product"]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await chooseDesign(page, 'נוכחי');
    await assertDesignSwitchInPortal(page, 'current');
    await assertFamilyBandExcludesContractMargin(page);
    await page.screenshot({ path: shot('contractor-current-1440.png') });

    await chooseDesign(page, 'V9');
    await assertDesignSwitchInPortal(page, 'v9');
    await assertFamilyBandExcludesContractMargin(page);
    await page.screenshot({ path: shot('contractor-v9-1440.png') });

    await chooseDesign(page, 'V10');
    await assertDesignSwitchInPortal(page, 'v10');
    await assertFamilyBandExcludesContractMargin(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await assertDocumentNotHorizontallyOverflowing(page);
    await page.screenshot({ path: shot('contractor-v10-390.png') });

    await page.goto('/he-IL/contractor');
    await expect(portal).toBeVisible();
    await exploreContractorProjectRoutes(page, portal);

    await page.setViewportSize({ width: 320, height: 844 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await assertDocumentNotHorizontallyOverflowing(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/he-IL/contractor');
    await expect(portal).toBeVisible();
    await exerciseDesignSwitcherKeyboard(page);

    await probeFormSurvivesDesignSwitch(page, portal);

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});

async function exploreContractorProjectRoutes(page: Page, portal: Locator): Promise<void> {
  const projectLink = portal.locator('a[href*="/contractor/projects/"]').first();
  if (!(await projectLink.isVisible().catch(() => false))) {
    return;
  }
  await projectLink.click();
  await expect(portal).toBeVisible();

  const tasksLink = page.getByRole('link', { name: 'משימות' }).first();
  if (await tasksLink.isVisible().catch(() => false)) {
    await tasksLink.click();
    await expect(portal).toBeVisible();
    return;
  }

  const workLink = page.getByRole('link', { name: 'עבודה', exact: true }).first();
  if (await workLink.isVisible().catch(() => false)) {
    await workLink.click();
    await expect(portal).toBeVisible();
  }
}

async function probeFormSurvivesDesignSwitch(page: Page, portal: Locator): Promise<void> {
  const field = await firstSafeTextField(portal);
  if (!field) {
    return;
  }
  await field.fill(FORM_PROBE);
  await chooseDesign(page, 'V9');
  await assertDesignSwitchInPortal(page, 'v9');
  await expect(field).toHaveValue(FORM_PROBE);
  await chooseDesign(page, 'נוכחי');
  await assertDesignSwitchInPortal(page, 'current');
  await expect(field).toHaveValue(FORM_PROBE);
}

async function exerciseDesignSwitcherKeyboard(page: Page): Promise<void> {
  const trigger = await designMenuTrigger(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const option = page.getByRole('menuitem', { name: 'V9', exact: true });
  await expect(option).toBeVisible();
  await option.focus();
  await page.keyboard.press('Enter');
  await assertDesignSwitchInPortal(page, 'v9');
}

async function assertDesignSwitchInPortal(page: Page, design: 'current' | 'v9' | 'v10'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-pf-design', design);
  await expect(page.locator(PORTAL)).toBeVisible();
}

async function assertFamilyBandExcludesContractMargin(page: Page): Promise<void> {
  const family = page.locator('[data-pf-design-landmark="v9-family"], [data-pf-design-landmark="v10-family"]');
  await expect(family.getByText('מרווח חוזי', { exact: false })).toHaveCount(0);
}

async function firstSafeTextField(portal: Locator): Promise<Locator | null> {
  const candidates = portal.locator(
    'input:not([type="password"]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([disabled])',
  );
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const field = candidates.nth(index);
    if (await field.isVisible().catch(() => false)) {
      return field;
    }
  }
  return null;
}

function shot(name: string): string {
  mkdirSync(SHOTS, { recursive: true });
  return path.join(SHOTS, name);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

function assertLocalHarness(page: Page): void {
  const host = new URL(page.url()).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('design-contractor-matrix spec only runs against the local harness');
  }
}

async function chooseDesign(page: Page, optionLabel: string): Promise<void> {
  await openAppearanceMenu(page);
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
  const expected =
    optionLabel === 'V9' ? 'v9' : optionLabel === 'V10' ? 'v10' : 'current';
  await expect(page.locator('html')).toHaveAttribute('data-pf-design', expected);
}

async function openAppearanceMenu(page: Page): Promise<void> {
  const trigger = await designMenuTrigger(page);
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click();
    return;
  }
  await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
}

async function designMenuTrigger(page: Page): Promise<Locator> {
  return page.getByRole('button', { name: DESIGN_SWITCHER });
}

async function assertDocumentNotHorizontallyOverflowing(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}