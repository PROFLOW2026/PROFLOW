import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { he } from '../fixtures/locales';
import { signInThroughForm } from '../fixtures/sign-in';
import { E2E_GC_CONTRACTOR, E2E_SINGLE_EMPLOYEE, OWNER, SEED_PASSWORD } from '../harness/config';

const SHOTS = path.join('tests', 'e2e', 'design', 'screenshots', 'matrix');
const SEEDED_PROJECT = /שיפוץ דירה ברמת גן/;
const DESIGNS = [
  ['נוכחי', 'current'],
  ['V9', 'v9'],
  ['V10', 'v10'],
] as const;
const WIDTHS = [1440, 390] as const;

type ShotRecord = {
  screen: string;
  design: string;
  width: number;
  landmarks: string[];
  overflow: number;
  designAttr: string | null;
};

test.describe('design closeout on the local harness', () => {
  test.describe.configure({ timeout: 480_000 });
  test.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });

  test('owner screens keep one dataset and different V9 and V10 structure', async ({ page }) => {
    const records: ShotRecord[] = [];
    await signInThroughForm(page, OWNER.email);
    assertLoopback(page);

    await page.goto('/he-IL/projects');
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible({ timeout: 90_000 });
    await page.getByRole('link', { name: SEEDED_PROJECT }).first().click();
    await page.waitForURL(/\/he-IL\/projects\/[^/]+/, { timeout: 90_000 });
    const projectUrl = page.url();

    await page.goto('/he-IL');
    await page.getByRole('combobox', { name: he.nav.experiencePreview.label }).selectOption({
      label: he.nav.experiencePreview.profiles.GENERAL_CONTRACTOR,
    });
    const financeBody = page.locator('[data-pf-design-finance-body]');
    await expect(financeBody.getByText(he.dashboard.ownerHeadline.actualProfit, { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });

    const financeText = new Map<string, string>();
    for (const [label, design] of DESIGNS) {
      await chooseDesign(page, label);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
        await page.goto('/he-IL');
        await expect(financeBody.getByText(he.dashboard.ownerHeadline.actualProfit, { exact: true }).first()).toBeVisible({
          timeout: 90_000,
        });
        const text = (await financeBody.innerText()).replace(/\s+/g, ' ').trim();
        if (width === 1440) financeText.set(design, text);
        records.push(await shoot(page, 'finance', design, width));

        await page.goto('/he-IL/projects');
        await expect(page.getByRole('heading', { name: he.projects.title, level: 1 })).toBeVisible({ timeout: 90_000 });
        await expect(page.getByPlaceholder(he.projects.list.searchPlaceholder)).toBeVisible();
        records.push(await shoot(page, 'projects', design, width));

        await page.goto(projectUrl);
        await expect(page.getByText(SEEDED_PROJECT).first()).toBeVisible({ timeout: 90_000 });
        records.push(await shoot(page, 'project', design, width));

        await page.goto('/he-IL/work');
        await expect(page.locator('[data-pf-shell="app"]')).toBeVisible({ timeout: 90_000 });
        records.push(await shoot(page, 'tasks', design, width));

        await page.goto('/he-IL/projects/new');
        await expect(page.getByLabel(he.projects.create.nameLabel)).toBeVisible({ timeout: 90_000 });
        records.push(await shoot(page, 'form', design, width));
      }
    }

    writeFileSync(path.join(SHOTS, 'owner-comparison.json'), JSON.stringify({ financeText: Object.fromEntries(financeText), records }, null, 2));
    expect(financeText.get('v9')).toBe(financeText.get('current'));
    expect(financeText.get('v10')).toBe(financeText.get('current'));
    assertStructureDiffers(records, 'projects');
    assertStructureDiffers(records, 'project');
    assertStructureDiffers(records, 'tasks');
    assertStructureDiffers(records, 'form');
    assertStructureDiffers(records, 'finance');
    for (const record of records) {
      expect(record.overflow, `${record.screen} ${record.design} ${record.width}`).toBeLessThanOrEqual(1);
    }
  });

  test('employee and contractor boards at desktop and mobile', async ({ page }) => {
    const records: ShotRecord[] = [];
    await page.context().clearCookies();
    await page.goto('/he-IL/employee/login');
    assertLoopback(page);
    await page.locator('#username').fill(E2E_SINGLE_EMPLOYEE.username);
    await page.locator('#pin').fill(E2E_SINGLE_EMPLOYEE.pin);
    await page.getByRole('button', { name: he.employeeApp.login.submit }).click();
    await expect(page.locator('[data-pf-employee-app]')).toBeVisible({ timeout: 90_000 });

    for (const [label, design] of DESIGNS) {
      await chooseDesign(page, label);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
        await expect(page.locator('[data-pf-employee-app]')).toBeVisible();
        records.push(await shoot(page, 'employee', design, width));
      }
    }
    assertStructureDiffers(records, 'employee');

    await page.context().clearCookies();
    await page.goto('/he-IL/contractor/sign-in');
    assertLoopback(page);
    await page.locator('#contractor-username').fill(E2E_GC_CONTRACTOR.username);
    await page.locator('#contractor-password').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'כניסה' }).click();
    await page.waitForURL(/\/contractor\/?$/, { timeout: 90_000 });
    await expect(page.locator('[data-pf-contractor-portal]')).toBeVisible({ timeout: 90_000 });

    for (const [label, design] of DESIGNS) {
      await chooseDesign(page, label);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
        await expect(page.locator('[data-pf-contractor-portal]')).toBeVisible();
        const band = page.locator('[data-pf-design-landmark="v9-family"], [data-pf-design-landmark="v10-family"]');
        await expect(band.getByText('מרווח חוזי')).toHaveCount(0);
        records.push(await shoot(page, 'contractor', design, width));
      }
    }
    assertStructureDiffers(records, 'contractor');
    writeFileSync(path.join(SHOTS, 'surfaces-comparison.json'), JSON.stringify(records, null, 2));
  });

  test('expense draft submit stays on loopback and keeps the same server action', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'GET' || request.method() === 'HEAD') return;
      const host = new URL(request.url()).hostname;
      if (host !== '127.0.0.1' && host !== 'localhost') foreign.push(request.url());
    });

    await signInThroughForm(page, OWNER.email);
    assertLoopback(page);
    await page.goto('/he-IL/projects');
    await page.getByRole('link', { name: SEEDED_PROJECT }).first().click();
    await page.waitForURL(/\/he-IL\/projects\/([^/]+)/, { timeout: 90_000 });
    const projectId = new URL(page.url()).pathname.split('/').pop();
    await page.goto(`/he-IL/expenses/new?projectId=${projectId}`);
    await expect(page.locator('form').getByRole('textbox', { name: he.expenses.fields.description })).toBeVisible({
      timeout: 90_000,
    });

    const description = `טיוטת עיצוב ${Date.now()}`;
    const amount = page.getByRole('textbox', { name: he.expenses.fields.amount });
    const note = page.locator('form').getByRole('textbox', { name: he.expenses.fields.description });
    await amount.fill('1250');
    await note.fill(description);
    const before = await actionFingerprint(page);

    await chooseDesign(page, 'V9');
    await expect(amount).toHaveValue('1250');
    await expect(note).toHaveValue(description);
    const after = await actionFingerprint(page);
    expect(after).toBe(before);

    const posted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.includes('/expenses/new'),
    );
    await page.getByRole('button', { name: he.expenses.actions.saveAsDraft }).click();
    const response = await posted;
    expect(new URL(response.url()).hostname).toBe('127.0.0.1');
    expect(response.request().headers()['next-action']).toBeTruthy();
    expect(response.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/he-IL\/expenses\/[0-9a-f-]+$/, { timeout: 45_000 });
    expect(foreign).toEqual([]);
    test.info().annotations.push({
      type: 'expense-draft',
      description: `local draft ${page.url()} via next-action on 127.0.0.1. Detail RSC is not awaited: the harness logs destination stream errored and the document load does not finish.`,
    });
  });
});

function assertLoopback(page: Page): void {
  const host = new URL(page.url()).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`closeout spec left loopback: ${page.url()}`);
  }
}

function assertStructureDiffers(records: ShotRecord[], screen: string): void {
  const v9 = records.find((record) => record.screen === screen && record.design === 'v9' && record.width === 1440);
  const v10 = records.find((record) => record.screen === screen && record.design === 'v10' && record.width === 1440);
  expect(v9?.landmarks.some((landmark) => landmark.startsWith('v9'))).toBe(true);
  expect(v10?.landmarks.some((landmark) => landmark.startsWith('v10'))).toBe(true);
  expect(v9?.landmarks.join('|')).not.toBe(v10?.landmarks.join('|'));
}

async function shoot(page: Page, screen: string, design: string, width: number): Promise<ShotRecord> {
  mkdirSync(SHOTS, { recursive: true });
  if (design !== 'current') {
    await expect(page.locator(`[data-pf-design-landmark^="${design}"]`).first()).toBeVisible({ timeout: 20_000 });
  }
  const landmarks = await page.locator('[data-pf-design-landmark]').evaluateAll((nodes) =>
    [...new Set(nodes.map((node) => node.getAttribute('data-pf-design-landmark') ?? ''))].filter(Boolean).sort(),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({ path: path.join(SHOTS, `${screen}-${design}-${width}.png`) });
  return {
    screen,
    design,
    width,
    landmarks,
    overflow,
    designAttr: await page.locator('html').getAttribute('data-pf-design'),
  };
}

async function actionFingerprint(page: Page): Promise<string> {
  return page.locator('form').first().evaluate((form) => {
    const fields = [...form.querySelectorAll('input')].flatMap((input) => {
      const name = input.getAttribute('name') ?? '';
      if (!name.startsWith('$ACTION')) return [];
      return [`${name}=${input.value}`];
    });
    return JSON.stringify({ action: form.getAttribute('action'), fields });
  });
}

async function chooseDesign(page: Page, optionLabel: string): Promise<void> {
  const header = page.getByRole('button', { name: 'בחירת מצב תצוגה' });
  if (await header.isVisible().catch(() => false)) await header.click();
  else await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-pf-design',
    optionLabel === 'V9' ? 'v9' : optionLabel === 'V10' ? 'v10' : 'current',
  );
}
