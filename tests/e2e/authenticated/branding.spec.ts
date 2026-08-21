import { expect, test } from '@playwright/test';
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

/** Minimal 1×1 PNG. */
const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function writeTempPng(name: string): string {
  const dir = path.resolve(process.cwd(), 'tests/e2e/.tmp');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, MINI_PNG);
  return file;
}

test.describe('organization branding', () => {
  test('Settings company + branding → preview/save → branded output', async ({ page }) => {
    const displayName = `מותג E2E ${Date.now()}`;
    const primary = '#B45309';

    await page.goto('/he-IL/settings/business');
    await expect(page.getByRole('heading', { name: 'פרטי החברה' })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByLabel('שם לתצוגה').fill(displayName);
    await page.getByRole('button', { name: 'שמירה' }).first().click();
    await expect(page.getByText('פרטי החברה נשמרו.')).toBeVisible({ timeout: 20_000 });

    await page.goto('/he-IL/settings/branding');
    await expect(page.getByRole('heading', { name: 'מיתוג ומסמכים' })).toBeVisible({
      timeout: 30_000,
    });

    const colorText = page
      .locator('section')
      .filter({ hasText: 'צבעי מסמך' })
      .locator('input[type="text"]')
      .first();
    await expect(colorText).toBeVisible();
    await colorText.fill(primary);

    const preview = page.getByLabel('תצוגה מקדימה של מסמך');
    await expect(preview).toBeVisible();
    await expect(preview.getByText(displayName).first()).toBeVisible({ timeout: 10_000 });
    await expect(preview.getByText('הצעת מחיר לדוגמה')).toBeVisible();

    await page.getByRole('button', { name: 'שמירה' }).first().click();
    await expect(page.getByText('המיתוג נשמר.')).toBeVisible({ timeout: 20_000 });

    const logoA = writeTempPng(`logo-a-${Date.now()}.png`);
    await page.locator('input[type="file"]').first().setInputFiles(logoA);
    await expect(preview.locator('img').first()).toBeVisible({ timeout: 30_000 });

    // PO / service completion smoke: surfaces remain reachable after branding save.
    await page.goto('/he-IL/procurement');
    await expect(page).toHaveURL(/\/he-IL\/procurement/);
    await page.goto('/he-IL/work-orders');
    await expect(page).toHaveURL(/\/he-IL\//);

    await page.goto('/he-IL/settings/branding');
    await expect(page.getByLabel('תצוגה מקדימה של מסמך').getByText(displayName).first()).toBeVisible(
      { timeout: 20_000 },
    );
  });

  test('Logo replace A→B updates live preview (historical freeze covered in integration)', async ({
    page,
  }) => {
    await page.goto('/he-IL/settings/branding');
    await expect(page.getByRole('heading', { name: 'מיתוג ומסמכים' })).toBeVisible({
      timeout: 30_000,
    });

    const logoA = writeTempPng(`hist-a-${Date.now()}.png`);
    const logoB = writeTempPng(`hist-b-${Date.now()}.png`);
    const fileInput = page.locator('input[type="file"]').first();
    const preview = page.getByLabel('תצוגה מקדימה של מסמך');

    await fileInput.setInputFiles(logoA);
    await expect(preview.locator('img').first()).toBeVisible({ timeout: 30_000 });
    const srcA = await preview.locator('img').first().getAttribute('src');
    expect(srcA).toBeTruthy();

    await fileInput.setInputFiles(logoB);
    await expect
      .poll(async () => preview.locator('img').first().getAttribute('src'), { timeout: 30_000 })
      .not.toBe(srcA);

    await page.goto('/he-IL/quotes');
    await expect(page.getByRole('heading', { name: 'הצעות מחיר', exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });
});
