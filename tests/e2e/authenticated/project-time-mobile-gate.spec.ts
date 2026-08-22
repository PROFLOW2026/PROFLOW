import { expect, test } from '@playwright/test';
import {
  assertNoPageHorizontalOverflow,
  QUICK_CREATE_FAB,
  withViewport,
} from '../fixtures/layout';
import { loadWorld } from '../fixtures/world';

const MOBILE_WIDTHS = [320, 360, 390, 430] as const;
const TIME_PANEL_TITLE = 'שעות בפרויקט זה';
const LOG_TIME_CTA = 'דיווח שעות';

test.describe('project time mobile visual gate', () => {
  test.use({ storageState: 'tests/e2e/.auth/owner.json' });

  for (const width of MOBILE_WIDTHS) {
    test(`project time tab @ ${width}px`, async ({ page }) => {
      const world = loadWorld();

      await withViewport(page, width, async () => {
        await page.goto(`/he-IL/projects/${world.projectId}?tab=time`, { waitUntil: 'networkidle' });

        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

        const panel = page.locator('[data-pf-project-time-panel]');
        await expect(panel.getByRole('heading', { name: TIME_PANEL_TITLE })).toBeVisible();

        await assertNoPageHorizontalOverflow(page, `project time ${width}px`);

        await expect(page.locator(QUICK_CREATE_FAB)).toHaveCount(0);

        await expect(panel.getByRole('link', { name: LOG_TIME_CTA })).toBeVisible();

        await expect(panel.getByRole('table')).toBeHidden();

        const mobileList = page.locator('[data-pf-time-mobile-list]');
        if ((await mobileList.count()) > 0) {
          await expect(mobileList).toBeVisible();
          const bodyText = await panel.innerText();
          expect(bodyText).not.toMatch(/\d+\.\d{4,}/);
        }

        const clipped = await page.evaluate(() => {
          const root = document.documentElement;
          const panelEl = document.querySelector('[data-pf-project-time-panel]');
          if (!panelEl) return { ok: true, issues: [] as string[] };

          const issues: string[] = [];
          const rootRect = root.getBoundingClientRect();

          for (const el of panelEl.querySelectorAll('p, h2, h3, span, a, button')) {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none' || rect.width === 0) {
              continue;
            }
            if (rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1) {
              issues.push(`${el.tagName}:${(el.textContent ?? '').slice(0, 40)}`);
            }
          }

          return { ok: issues.length === 0, issues };
        });

        expect(clipped.ok, `clipped nodes @${width}px: ${clipped.issues.join('; ')}`).toBe(true);
      });
    });
  }
});
