import { expect, test } from '@playwright/test';
import { auditMobileShellOnPage, readMobileNavGeometry } from './fixtures/mobile-shell-audit';
import { assertFabClearsBottomNav, assertNoPageHorizontalOverflow, MOBILE_NAV } from './fixtures/layout';
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

test.describe('mobile shell audit', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.setTimeout(120_000);

  for (const route of ROUTES) {
    test(`${route.name} has stable HUD and no horizontal page scroll`, async ({ page }) => {
      const world = loadWorld();
      const path = typeof route.path === 'function' ? route.path(world) : route.path;
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(MOBILE_NAV, { timeout: 30_000 });

      await assertNoPageHorizontalOverflow(page, `${route.name} top`);

      const navTop = await readMobileNavGeometry(page);
      expect(navTop, `${route.name} nav present`).not.toBeNull();

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(200);

      await assertNoPageHorizontalOverflow(page, `${route.name} scrolled`);

      const navScrolled = await readMobileNavGeometry(page);
      expect(navScrolled, `${route.name} nav after scroll`).not.toBeNull();
      expect(Math.abs((navTop?.top ?? 0) - (navScrolled?.top ?? 0)), `${route.name} HUD top drift`).toBeLessThanOrEqual(
        0.5,
      );
      expect(
        Math.abs((navTop?.bottom ?? 0) - (navScrolled?.bottom ?? 0)),
        `${route.name} HUD bottom drift`,
      ).toBeLessThanOrEqual(0.5);

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);

      const navUp = await readMobileNavGeometry(page);
      expect(Math.abs((navTop?.top ?? 0) - (navUp?.top ?? 0)), `${route.name} HUD top after scroll up`).toBeLessThanOrEqual(
        0.5,
      );

      const metrics = await auditMobileShellOnPage(page);
      expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
    });
  }

  test('dashboard FAB clears bottom nav', async ({ page }) => {
    await page.goto('/he-IL', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(MOBILE_NAV, { timeout: 30_000 });
    await assertFabClearsBottomNav(page);
  });
});
