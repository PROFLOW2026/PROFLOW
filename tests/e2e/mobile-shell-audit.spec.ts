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

  test('dashboard has no visual overflow when visual viewport is narrower than layout viewport', async ({
    page,
  }) => {
    await page.goto('/he-IL', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(MOBILE_NAV, { timeout: 30_000 });

    // Android: innerWidth 390, visualViewport.width 387, offsetLeft 3 (typical gap).
    const audit = await page.evaluate(() => {
      const viewportLeft = 3;
      const viewportWidth = 387;
      const viewportRight = viewportLeft + viewportWidth;

      document.documentElement.style.setProperty('--pf-visual-viewport-width', `${viewportWidth}px`);
      document.documentElement.style.setProperty(
        '--pf-visual-viewport-offset-left',
        `${viewportLeft}px`,
      );

      let maxRightOverflowPx = 0;
      let maxLeftOverflowPx = 0;
      let topOffender: { selector: string; overflowPx: number; left: number; right: number } | null =
        null;

      const html = document.documentElement;

      for (const element of [html, document.body, ...document.querySelectorAll<HTMLElement>('*')]) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) continue;
        const leftOverflow = viewportLeft - rect.left;
        const rightOverflow = rect.right - viewportRight;
        const overflowPx = Math.max(
          leftOverflow > 0.1 ? leftOverflow : 0,
          rightOverflow > 0.1 ? rightOverflow : 0,
        );
        if (overflowPx <= 0.1) continue;

        maxLeftOverflowPx = Math.max(maxLeftOverflowPx, leftOverflow > 0.1 ? leftOverflow : 0);
        maxRightOverflowPx = Math.max(maxRightOverflowPx, rightOverflow > 0.1 ? rightOverflow : 0);

        if (!topOffender || overflowPx > topOffender.overflowPx) {
          topOffender = {
            selector:
              element === html
                ? 'html'
                : element === document.body
                  ? 'body'
                  : element.dataset.pfMobileNav !== undefined
                    ? '[data-pf-mobile-nav]'
                    : element.dataset.pfShell
                      ? '[data-pf-shell]'
                      : element.tagName.toLowerCase(),
            overflowPx,
            left: rect.left,
            right: rect.right,
          };
        }
      }

      const htmlRect = html.getBoundingClientRect();
      return {
        htmlComputedWidth: getComputedStyle(html).width,
        htmlMarginLeft: getComputedStyle(html).marginLeft,
        htmlRectLeft: htmlRect.left,
        htmlRectRight: htmlRect.right,
        documentClientWidth: html.clientWidth,
        documentScrollWidth: html.scrollWidth,
        maxRightOverflowPx,
        maxLeftOverflowPx,
        topOffender,
      };
    });

    expect(parseFloat(audit.htmlComputedWidth), 'html width tracks vv var').toBeCloseTo(387, 0);
    expect(parseFloat(audit.htmlMarginLeft), 'html offset tracks vv var').toBeCloseTo(3, 0);
    expect(audit.maxRightOverflowPx, `android vv gap (${audit.topOffender?.selector})`).toBeLessThanOrEqual(
      0.5,
    );
    expect(
      audit.maxLeftOverflowPx,
      `android vv gap left (${JSON.stringify(audit.topOffender)})`,
    ).toBeLessThanOrEqual(0.5);
    expect(audit.documentScrollWidth).toBeLessThanOrEqual(audit.documentClientWidth);
  });
});
