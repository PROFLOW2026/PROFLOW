import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { he } from '../fixtures/locales';
import { signInThroughForm } from '../fixtures/sign-in';
import {
  E2E_DUAL_ORG_A_PROJECT,
  E2E_GC_CONTRACTOR,
  E2E_SINGLE_EMPLOYEE,
  OWNER,
  SEED_PASSWORD,
} from '../harness/config';

const DESIGN_SWITCHER = 'בחירת מצב תצוגה';
const RELOAD_MARKER = '__pfDesignSwitchNoReload';
const FORM_PROBE = 'ערך שנשמר במעבר עיצוב';
const FILTER_PROBE = 'סינון שנשמר';
const SHOTS = path.join('tests', 'e2e', 'design', 'screenshots');

test.describe('product design switch on next dev (he-IL)', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });

  test('signed-out sign-in has no product design scope', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.context().clearCookies();
    await page.goto('/he-IL/sign-in');
    assertLocalHarness(page);
    await expect(page.locator('#sign-in-email')).toBeVisible();
    await expect(page.locator('[data-pf-design-scope="product"]')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('current design at desktop, tablet, and mobile stays classic-capable and does not overflow', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await chooseDesign(page, 'נוכחי');
    await chooseStyle(page, 'פרימיום');

    for (const width of [1440, 1024, 768, 390, 320] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto('/he-IL');
      await expect(page.locator('[data-pf-shell="app"]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('[data-pf-design-variant="current"]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'current');
      await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'premium');
      await expect(page.locator('[data-pf-design-landmark="v9-hero"]')).toHaveCount(0);
      await assertDocumentNotHorizontallyOverflowing(page);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('v9 switches without reload, survives refresh, and matches the editorial landmarks', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await page.goto('/he-IL');
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible();

    const urlBefore = page.url();
    await page.evaluate((key) => {
      (window as unknown as Record<string, string>)[key] = 'alive';
    }, RELOAD_MARKER);
    await chooseDesign(page, 'V9');

    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    expect(page.url()).toBe(urlBefore);
    expect(
      await page.evaluate((key) => (window as unknown as Record<string, string | undefined>)[key], RELOAD_MARKER),
    ).toBe('alive');
    const familyBand = page.locator('[data-pf-design-landmark="v9-family"]');
    await expect(familyBand).toBeVisible();
    await expect(familyBand).toContainText('לוח');
    await expect(familyBand.getByText('מרווח חוזי', { exact: false })).toHaveCount(0);
    await page.screenshot({ path: shot('main-dashboard-v9-1440.png') });

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    await expect(page.locator('[data-pf-design-variant="v9"]')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('v10 list keeps the scan landmark at 390 and does not overflow', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/he-IL/projects');
    await expect(page.getByRole('heading', { name: he.projects.title, level: 1 })).toBeVisible();
    await chooseDesign(page, 'V10');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v10');
    await expect(page.locator('[data-pf-design-family="list"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'פירוט משני' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await assertDocumentNotHorizontallyOverflowing(page);
    await page.screenshot({ path: shot('main-projects-v10-390.png') });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('returning to current keeps the stored premium style', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await page.goto('/he-IL');
    await chooseStyle(page, 'פרימיום');
    await chooseDesign(page, 'V10');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v10');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'premium');
    const band = page.locator('[data-pf-design-landmark="v10-family"]');
    await expect(band).toBeVisible();
    await expect(band.getByText('מרווח חוזי', { exact: false })).toHaveCount(0);
    await expect(band.getByText('מע״מ', { exact: false })).toHaveCount(0);
    await page.screenshot({ path: shot('main-dashboard-v10-1440.png') });
    await chooseDesign(page, 'נוכחי');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'current');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'premium');
    await chooseStyle(page, 'קלאסי');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'classic');
    await chooseStyle(page, 'מודרני');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'modern');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a typed project name survives the design switch', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await page.goto('/he-IL/projects/new');
    const nameField = page.getByLabel(he.projects.create.nameLabel);
    await expect(nameField).toBeVisible();
    await nameField.fill(FORM_PROBE);
    await chooseDesign(page, 'V9');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    await expect(nameField).toHaveValue(FORM_PROBE);
    await page.screenshot({ path: shot('main-form-v9-1440.png') });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the project search filter survives the design switch', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/he-IL/projects');
    const search = page.getByPlaceholder(he.projects.list.searchPlaceholder);
    await expect(search).toBeVisible();
    await search.fill(FILTER_PROBE);
    const facet = page.getByRole('combobox', { name: he.projects.list.filterFacet });
    await facet.click();
    await page.getByRole('option', { name: he.projects.list.facets.active, exact: true }).click();
    await expect(page.locator('input[name="facet"]')).toHaveValue('active');
    await chooseDesign(page, 'V9');
    await expect(search).toHaveValue(FILTER_PROBE);
    await expect(page.locator('input[name="facet"]')).toHaveValue('active');
    await page.screenshot({ path: shot('main-projects-v9-1440.png') });
    await chooseDesign(page, 'V10');
    await expect(search).toHaveValue(FILTER_PROBE);
    await expect(page.locator('input[name="facet"]')).toHaveValue('active');
    await chooseDesign(page, 'נוכחי');
    await expect(search).toHaveValue(FILTER_PROBE);
    await expect(page.locator('input[name="facet"]')).toHaveValue('active');
    await expect(page.locator('[data-pf-design-landmark="v9-table"], [data-pf-design-landmark="v9-family"]').first()).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 844 });
    await assertDocumentNotHorizontallyOverflowing(page);
    await page.screenshot({ path: shot('main-projects-current-320.png') });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a design cookie set before navigation does not clear a filter typed as the page settles', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await page.context().addCookies([
      { name: 'pf-ui-design', value: 'v10', url: 'http://127.0.0.1:3100' },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/he-IL/projects');
    const search = page.getByPlaceholder(he.projects.list.searchPlaceholder);
    await search.fill(FILTER_PROBE);
    await expect(page.locator('[data-pf-design-list="v10"]')).toBeVisible();
    await expect(search).toHaveValue(FILTER_PROBE);
    await chooseDesign(page, 'V9');
    await expect(search).toHaveValue(FILTER_PROBE);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the open project tab stays selected across Current, V9, and V10', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/he-IL/projects');
    await page.getByRole('link', { name: E2E_DUAL_ORG_A_PROJECT }).first().click();
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 90_000 });
    const nextTab = page.getByRole('tab', { selected: false }).first();
    const tabName = (await nextTab.innerText()).trim();
    await nextTab.click();
    await page.waitForURL(/tab=/);
    await expect(page.getByRole('tab', { name: tabName, selected: true })).toBeVisible();
    const url = page.url();
    await chooseDesign(page, 'V9');
    expect(page.url()).toBe(url);
    await expect(page.getByRole('tab', { name: tabName, selected: true })).toBeVisible();
    await chooseDesign(page, 'V10');
    expect(page.url()).toBe(url);
    await expect(page.getByRole('tab', { name: tabName, selected: true })).toBeVisible();
    await chooseDesign(page, 'נוכחי');
    expect(page.url()).toBe(url);
    await expect(page.getByRole('tab', { name: tabName, selected: true })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the design switcher opens from the keyboard', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/he-IL');
    const trigger = page.getByRole('button', { name: DESIGN_SWITCHER });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const option = page.getByRole('menuitem', { name: 'V9', exact: true });
    await expect(option).toBeVisible();
    await option.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('employee app can switch design without leaving the employee shell', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.context().clearCookies();
    await page.goto('/he-IL/employee/login');
    assertLocalHarness(page);
    await page.locator('#username').fill(E2E_SINGLE_EMPLOYEE.username);
    await page.locator('#pin').fill(E2E_SINGLE_EMPLOYEE.pin);
    await page.getByRole('button', { name: he.employeeApp.login.submit }).click();
    await expect(page.locator('[data-pf-employee-app]')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-pf-design-scope="product"]')).toBeVisible();
    for (const option of ['נוכחי', 'V9', 'V10'] as const) {
      await chooseDesign(page, option);
      await expect(page.locator('[data-pf-employee-app]')).toBeVisible();
      await expect(page.locator('[data-pf-design-landmark="v9-family"], [data-pf-design-landmark="v10-family"]').getByText('מרווח חוזי', { exact: false })).toHaveCount(0);
    }
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v10');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.setViewportSize({ width: 320, height: 844 });
    await assertDocumentNotHorizontallyOverflowing(page);
    await page.screenshot({ path: shot('employee-home-v9-320.png') });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('contractor portal can switch design without leaving the portal', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.context().clearCookies();
    await page.goto('/he-IL/contractor/sign-in');
    assertLocalHarness(page);
    await page.locator('#contractor-username').fill(E2E_GC_CONTRACTOR.username);
    await page.locator('#contractor-password').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'כניסה' }).click();
    await page.waitForURL(/\/contractor\/?$/, { timeout: 45_000 });
    await expect(page.locator('[data-pf-contractor-portal]')).toBeVisible();
    await expect(page.locator('[data-pf-design-scope="product"]')).toBeVisible();
    await chooseDesign(page, 'V10');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v10');
    await expect(page.locator('[data-pf-contractor-portal]')).toBeVisible();
    await expect(page.locator('[data-pf-design-landmark="v10-family"]').getByText('מרווח חוזי', { exact: false })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertDocumentNotHorizontallyOverflowing(page);
    await page.screenshot({ path: shot('contractor-home-v10-390.png') });
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

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
    throw new Error('design-switch spec only runs against the local harness');
  }
}

async function chooseDesign(page: Page, optionLabel: string): Promise<void> {
  await openAppearanceMenu(page);
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-pf-design',
    optionLabel === 'V9' ? 'v9' : optionLabel === 'V10' ? 'v10' : 'current',
  );
}

async function chooseStyle(page: Page, optionLabel: string): Promise<void> {
  await openAppearanceMenu(page);
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
}

async function openAppearanceMenu(page: Page): Promise<void> {
  const header = page.getByRole('button', { name: DESIGN_SWITCHER });
  if (await header.isVisible().catch(() => false)) {
    await header.click();
    return;
  }
  await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
}

async function assertDocumentNotHorizontallyOverflowing(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}
