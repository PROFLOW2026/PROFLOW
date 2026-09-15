import type { Page } from '@playwright/test';

export type MobileShellAuditResult = {
  innerWidth: number;
  visualViewportWidth: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  bodyClientWidth: number;
  bodyScrollWidth: number;
  visualViewportBottomOffset: number;
  visualViewportOffsetTop: number;
  visualViewportHeight: number;
  navBottom: number | null;
  visualViewportBottom: number | null;
  navOvershootPx: number | null;
  maxRightOverflowPx: number;
  maxLeftOverflowPx: number;
  offenders: Array<{ selector: string; left: number; right: number; overflowPx: number }>;
};

export async function auditMobileShellOnPage(page: Page): Promise<MobileShellAuditResult> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    const viewportLeft = vv?.offsetLeft ?? 0;
    const viewportWidth = vv?.width ?? window.innerWidth;
    const viewportRight = viewportLeft + viewportWidth;

    let maxRightOverflowPx = 0;
    let maxLeftOverflowPx = 0;
    const offenders: MobileShellAuditResult['offenders'] = [];

    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const leftOverflow = viewportLeft - rect.left;
      const rightOverflow = rect.right - viewportRight;
      if (leftOverflow <= 0.5 && rightOverflow <= 0.5) continue;

      const overflowPx = Math.max(
        leftOverflow > 0.5 ? leftOverflow : 0,
        rightOverflow > 0.5 ? rightOverflow : 0,
      );
      maxLeftOverflowPx = Math.max(maxLeftOverflowPx, leftOverflow > 0.5 ? leftOverflow : 0);
      maxRightOverflowPx = Math.max(maxRightOverflowPx, rightOverflow > 0.5 ? rightOverflow : 0);

      let selector = element.tagName.toLowerCase();
      if (element.dataset.pfMobileNav !== undefined) selector = '[data-pf-mobile-nav]';
      else if (element.dataset.pfQuickCreate) {
        selector = `[data-pf-quick-create="${element.dataset.pfQuickCreate}"]`;
      } else if (element.matches('a[href="#main"]')) {
        selector = 'a[href="#main"]';
      } else if (element.id) selector = `#${element.id}`;

      offenders.push({
        selector,
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        overflowPx: Math.round(overflowPx * 10) / 10,
      });
      if (offenders.length >= 8) break;
    }

    const nav = document.querySelector<HTMLElement>('[data-pf-mobile-nav]');
    const navRect = nav?.getBoundingClientRect();
    const vvBottom = vv ? vv.offsetTop + vv.height : null;
    const bottomVar =
      getComputedStyle(root).getPropertyValue('--pf-visual-viewport-bottom-offset').trim() || '0';

    return {
      innerWidth: window.innerWidth,
      visualViewportWidth: viewportWidth,
      documentClientWidth: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      visualViewportBottomOffset: parseFloat(bottomVar) || 0,
      visualViewportOffsetTop: vv?.offsetTop ?? 0,
      visualViewportHeight: vv?.height ?? window.innerHeight,
      navBottom: navRect ? Math.round(navRect.bottom * 10) / 10 : null,
      visualViewportBottom: vvBottom != null ? Math.round(vvBottom * 10) / 10 : null,
      navOvershootPx:
        navRect && vvBottom != null ? Math.round((navRect.bottom - vvBottom) * 10) / 10 : null,
      maxRightOverflowPx: Math.round(maxRightOverflowPx * 10) / 10,
      maxLeftOverflowPx: Math.round(maxLeftOverflowPx * 10) / 10,
      offenders,
    };
  });
}
