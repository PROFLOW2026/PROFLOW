import { expect, test } from '@playwright/test';
import { auditMobileShellOnPage } from './fixtures/mobile-shell-audit';
import { assertNoPageHorizontalOverflow, MOBILE_NAV } from './fixtures/layout';
import { loadWorld, type SeededWorld } from './fixtures/world';

type AuditRoute = {
  name: string;
  path: string | ((world: SeededWorld) => string);
};

const ROUTES: AuditRoute[] = [
  { name: 'dashboard', path: '/he-IL' },
  { name: 'project', path: (world) => `/he-IL/projects/${world.projectId}` },
  { name: 'company-files', path: '/he-IL/company-files' },
  { name: 'project-files', path: (world) => `/he-IL/projects/${world.projectId}?tab=files` },
];

test.describe('mobile shell pixel audit', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.setTimeout(120_000);

  for (const route of ROUTES) {
    test(`${route.name} has zero page overflow and HUD within visual viewport`, async ({ page }) => {
      const world = loadWorld();
      const path = typeof route.path === 'function' ? route.path(world) : route.path;
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(MOBILE_NAV, { timeout: 30_000 });

      const top = await auditMobileShellOnPage(page);
      expect(top.documentScrollWidth, `${route.name} top scrollWidth`).toBeLessThanOrEqual(
        top.documentClientWidth,
      );
      expect(top.maxRightOverflowPx, `${route.name} top right overflow`).toBeLessThanOrEqual(0.5);
      if (top.navOvershootPx != null) {
        expect(top.navOvershootPx, `${route.name} nav overshoot at top`).toBeLessThanOrEqual(0.5);
      }

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);

      const scrolled = await auditMobileShellOnPage(page);
      expect(scrolled.documentScrollWidth, `${route.name} scrolled scrollWidth`).toBeLessThanOrEqual(
        scrolled.documentClientWidth,
      );
      expect(scrolled.maxRightOverflowPx, `${route.name} scrolled right overflow`).toBeLessThanOrEqual(
        0.5,
      );
      if (scrolled.navOvershootPx != null) {
        expect(scrolled.navOvershootPx, `${route.name} nav overshoot scrolled`).toBeLessThanOrEqual(
          0.5,
        );
      }

      await assertNoPageHorizontalOverflow(page, `${route.name} scrolled`);
    });
  }
});
