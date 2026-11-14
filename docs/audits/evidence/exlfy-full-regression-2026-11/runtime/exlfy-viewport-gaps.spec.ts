/**
 * Audit-only gap viewports (360 / 430 / 1920) — dashboard smoke + screenshots.
 * Keeps CRITICAL_OVERFLOW_WIDTHS suite separate for short runs.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  assertFabClearsBottomNav,
  assertNoPageHorizontalOverflow,
} from '../../../../../tests/e2e/fixtures/layout';

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots', 'viewports');
const GAP_WIDTHS = [360, 430, 1920] as const;

test.describe('EXLFY viewport gaps (owner)', () => {
  test.setTimeout(120_000);

  for (const width of GAP_WIDTHS) {
    test(`dashboard gap viewport @${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      const response = await page.goto('/he-IL', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      expect(response?.status() ?? 0).toBeLessThan(400);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl', { timeout: 15_000 });
      await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
      await assertNoPageHorizontalOverflow(page, `dashboard@${width}`);
      if (width <= 430) {
        await assertFabClearsBottomNav(page);
      }
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `dashboard-${width}.png`),
        fullPage: false,
      });
    });
  }
});
