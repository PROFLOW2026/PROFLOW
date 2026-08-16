import { expect, type Page } from '@playwright/test';

/** Phone widths from owner screenshot matrix. */
export const MOBILE_OVERFLOW_WIDTHS = [320, 360, 375, 390, 412, 430] as const;
/** Tablet widths that must not page-scroll from desktop tables. */
export const TABLET_OVERFLOW_WIDTHS = [768, 820, 1024] as const;
/** Desktop widths including large monitors. */
export const DESKTOP_OVERFLOW_WIDTHS = [1280, 1440, 1920] as const;

/** Full owner matrix - expensive; use for highest-risk surfaces (reports). */
export const PAGE_OVERFLOW_WIDTHS = [
  ...MOBILE_OVERFLOW_WIDTHS,
  ...TABLET_OVERFLOW_WIDTHS,
  ...DESKTOP_OVERFLOW_WIDTHS,
] as const;

/**
 * Critical route matrix from the UI stabilization brief.
 * Covers phones + tablet + default desktop without exploding CI runtime.
 */
export const CRITICAL_OVERFLOW_WIDTHS = [320, 375, 390, 768, 1280] as const;

export type OverflowWidth = (typeof PAGE_OVERFLOW_WIDTHS)[number];

export const MOBILE_NAV = '[data-pf-mobile-nav]';
export const QUICK_CREATE_FAB = '[data-pf-quick-create="fab"]';

/**
 * Assert the document itself does not scroll horizontally.
 *
 * Intentionally checks scrollWidth vs clientWidth - do not “fix” overflow by
 * asserting body/html overflow:hidden (that would hide the product bug).
 */
export async function assertNoPageHorizontalOverflow(page: Page, label?: string): Promise<void> {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      viewportWidth: window.innerWidth,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      htmlOverflowX: getComputedStyle(root).overflowX,
    };
  });

  // Guard against “fixing” overflow by clipping the root.
  expect(metrics.htmlOverflowX, `${label ?? 'page'} must not hide overflow on html`).not.toMatch(
    /^(hidden|clip)$/,
  );
  expect(metrics.bodyOverflowX, `${label ?? 'page'} must not hide overflow on body`).not.toMatch(
    /^(hidden|clip)$/,
  );

  expect(
    metrics.scrollWidth,
    `${label ?? 'page'} overflow @${metrics.viewportWidth}px: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
}

export async function withViewport(
  page: Page,
  width: number,
  run: () => Promise<void>,
  height = width < 768 ? 844 : 900,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await run();
}

/** FAB must sit entirely above the fixed bottom nav (mobile shell). */
export async function assertFabClearsBottomNav(page: Page): Promise<void> {
  const fab = page.locator(QUICK_CREATE_FAB);
  const bottomNav = page.locator(MOBILE_NAV);

  await expect(fab).toBeVisible();
  await expect(bottomNav).toBeVisible();

  const overlap = await fab.evaluate((fabEl, navSelector) => {
    const navEl = document.querySelector(navSelector);
    if (!navEl) return { ok: false as const };

    const fabRect = fabEl.getBoundingClientRect();
    const navRect = navEl.getBoundingClientRect();
    const intersects =
      fabRect.bottom > navRect.top + 1 &&
      fabRect.top < navRect.bottom - 1 &&
      fabRect.right > navRect.left + 1 &&
      fabRect.left < navRect.right - 1;

    return {
      ok: true as const,
      intersects,
      fabBottom: fabRect.bottom,
      navTop: navRect.top,
      gap: navRect.top - fabRect.bottom,
    };
  }, MOBILE_NAV);

  expect(overlap.ok, 'bottom nav selector must resolve').toBe(true);
  if (overlap.ok) {
    expect(overlap.intersects, `FAB overlaps bottom nav (gap=${overlap.gap})`).toBe(false);
    expect(
      overlap.fabBottom,
      `FAB bottom ${overlap.fabBottom} must clear nav top ${overlap.navTop}`,
    ).toBeLessThanOrEqual(overlap.navTop + 1);
  }
}
