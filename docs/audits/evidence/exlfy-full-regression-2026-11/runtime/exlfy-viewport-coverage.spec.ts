import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  assertFabClearsBottomNav,
  assertNoPageHorizontalOverflow,
  CRITICAL_OVERFLOW_WIDTHS,
} from '../../../../../tests/e2e/fixtures/layout';
import { loadWorld } from '../../../../../tests/e2e/fixtures/world';

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots', 'viewports');

type Surface = {
  key: string;
  path: string;
  /** Expect HTTP < 400 and a visible main landmark */
  soft?: boolean;
  fabOnMobile?: boolean;
};

function surfaces(): Surface[] {
  const world = loadWorld();
  const pid = world.projectId;
  return [
    { key: 'dashboard', path: '/he-IL', fabOnMobile: true },
    { key: 'workforce-employees', path: '/he-IL/workforce/employees' },
    { key: 'workforce-attendance', path: '/he-IL/workforce/attendance' },
    { key: 'workforce-time-approvals', path: '/he-IL/workforce/time/approvals' },
    { key: 'workforce-payroll', path: '/he-IL/workforce/payroll', soft: true },
    { key: 'expenses', path: '/he-IL/expenses' },
    { key: 'billing-payments', path: '/he-IL/billing/payments' },
    { key: 'vendors', path: '/he-IL/vendors' },
    { key: 'projects', path: '/he-IL/projects' },
    { key: 'work-tasks', path: '/he-IL/work' },
    { key: 'notifications', path: '/he-IL/notifications' },
    { key: 'scheduling', path: '/he-IL/scheduling' },
    { key: 'company-files', path: '/he-IL/company-files' },
    { key: 'project-documents', path: `/he-IL/projects/${pid}?tab=documents` },
    { key: 'project-infra', path: `/he-IL/projects/${pid}?tab=infra` },
    { key: 'project-quality-rfi', path: `/he-IL/projects/${pid}/quality/rfis`, soft: true },
    { key: 'project-quality-defects', path: `/he-IL/projects/${pid}/quality/defects`, soft: true },
  ];
}

test.describe('EXLFY viewport coverage (owner)', () => {
  test.setTimeout(180_000);

  for (const surface of surfaces()) {
    for (const width of CRITICAL_OVERFLOW_WIDTHS) {
      test(`${surface.key} @${width}px RTL overflow smoke`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        const response = await page.goto(surface.path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const status = response?.status() ?? 0;

        if (surface.soft && status >= 400) {
          test.info().annotations.push({
            type: 'soft-route',
            description: `HTTP ${status} — route may be unseeded or gated`,
          });
          return;
        }

        expect(status, `${surface.path} status`).toBeLessThan(400);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl', { timeout: 15_000 });
        await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
        await assertNoPageHorizontalOverflow(page, `${surface.key}@${width}`);

        if (surface.fabOnMobile && width <= 390) {
          await assertFabClearsBottomNav(page);
        }

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${surface.key}-${width}.png`),
          fullPage: false,
        });
      });
    }
  }

  test('dashboard dark color-scheme quick load @390', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/he-IL', { waitUntil: 'domcontentloaded' });
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dashboard-390-dark.png'),
      fullPage: false,
    });
  });

  // Gap widths 360/430/1920 live in exlfy-viewport-gaps.spec.ts (short focused runs).
});
