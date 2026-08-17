import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorld } from '../fixtures/world';

const OUT = join(process.cwd(), 'public', 'marketing', 'screenshots');
const shouldCapture = process.env.CAPTURE_MARKETING === '1';

test.describe('marketing screenshot capture', () => {
  test.skip(!shouldCapture, 'Set CAPTURE_MARKETING=1 to capture real homepage screenshots');

  test('captures live authenticated Hebrew UI', async ({ page, browser }) => {
    mkdirSync(OUT, { recursive: true });
    const world = loadWorld();

    async function shot(name: string) {
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(OUT, name),
        fullPage: false,
        animations: 'disabled',
      });
    }

    await page.goto('/he-IL/today');
    await page.getByRole('heading', { name: 'היום' }).first().waitFor();
    await shot('today-desktop.png');

    await page.goto(`/he-IL/projects/${world.projectId}`);
    await page.getByRole('heading', { name: 'שיפוץ דירה ברמת גן' }).first().waitFor();
    await shot('project-overview-desktop.png');

    await page.getByRole('tab', { name: 'כספים' }).click();
    await page.getByText('עלות בפועל').first().waitFor();
    await shot('financials-desktop.png');
    await shot('warnings-desktop.png');

    await page.goto('/he-IL/changes');
    await page.getByRole('heading', { name: 'שינויים ותוספות' }).first().waitFor();
    await shot('changes-desktop.png');

    await page.goto('/he-IL/billing');
    await page.getByRole('heading', { name: 'חיובים וגבייה' }).first().waitFor();
    await shot('billing-desktop.png');

    await page.goto('/he-IL/reports');
    await page.getByRole('heading', { name: /דוחות/ }).first().waitFor();
    await shot('reports-desktop.png');

    await page.goto('/he-IL/documents/ocr-review').catch(() => undefined);
    const invoiceHeading = page.getByRole('heading', { name: /קליטת|בדיקת/ }).first();
    if (await invoiceHeading.count()) {
      await invoiceHeading.waitFor();
      await shot('invoice-capture-desktop.png');
    } else {
      await page.screenshot({
        path: join(OUT, 'invoice-capture-desktop.png'),
        fullPage: false,
        animations: 'disabled',
      });
    }

    const mobile = await browser.newContext({
      storageState: 'tests/e2e/.auth/owner.json',
      locale: 'he-IL',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto('/he-IL/today');
    await mobilePage.getByRole('heading', { name: 'היום' }).first().waitFor();
    await mobilePage.waitForTimeout(400);
    await mobilePage.screenshot({
      path: join(OUT, 'today-mobile.png'),
      fullPage: false,
      animations: 'disabled',
    });
    await mobile.close();
  });
});
