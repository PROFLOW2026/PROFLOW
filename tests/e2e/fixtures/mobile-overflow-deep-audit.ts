import type { Page } from '@playwright/test';

export type MobileOverflowOffender = {
  selector: string;
  tag: string;
  id: string;
  dataAttrs: string;
  left: number;
  right: number;
  width: number;
  height: number;
  overflowPx: number;
  side: 'left' | 'right' | 'both';
  computedWidth: string;
  marginLeft: string;
  marginRight: string;
  transform: string;
  position: string;
  overflow: string;
  overflowX: string;
  minWidth: string;
  maxWidth: string;
  boxSizing: string;
  borderLeftWidth: string;
  borderRightWidth: string;
  paddingLeft: string;
  paddingRight: string;
  scrollWidth: number;
  clientWidth: number;
  internalScrollOverflow: number;
};

export type MobileOverflowDeepAudit = {
  innerWidth: number;
  visualViewportWidth: number;
  visualViewportOffsetLeft: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  bodyClientWidth: number;
  bodyScrollWidth: number;
  documentScrollMismatchPx: number;
  maxRightOverflowPx: number;
  maxLeftOverflowPx: number;
  topOffender: MobileOverflowOffender | null;
  offenders: MobileOverflowOffender[];
  scrollWidthOffenders: MobileOverflowOffender[];
};

function buildSelector(element: HTMLElement): string {
  if (element.dataset.pfMobileNav !== undefined) return '[data-pf-mobile-nav]';
  if (element.dataset.pfQuickCreate) return `[data-pf-quick-create="${element.dataset.pfQuickCreate}"]`;
  if (element.dataset.pfShell) return `[data-pf-shell="${element.dataset.pfShell}"]`;
  if (element.dataset.pfProjectTabs !== undefined) return '[data-pf-project-tabs]';
  if (element.dataset.pfWorkKindFilter !== undefined) return '[data-pf-work-kind-filter]';
  if (element.dataset.pfDashboardQuickAccess !== undefined) return '[data-pf-dashboard-quick-access]';
  if (element.matches('a[href="#main"]')) return 'a[href="#main"]';
  if (element.id) return `#${element.id}`;

  const tag = element.tagName.toLowerCase();
  const cls =
    typeof element.className === 'string'
      ? element.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
      : '';
  return cls ? `${tag}.${cls}` : tag;
}

function dataAttrSummary(element: HTMLElement): string {
  return Object.entries(element.dataset)
    .map(([key, value]) => `data-${key}=${value ?? ''}`)
    .slice(0, 4)
    .join(' ');
}

export async function runMobileOverflowDeepAudit(page: Page): Promise<MobileOverflowDeepAudit> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    const viewportLeft = vv?.offsetLeft ?? 0;
    const viewportWidth = vv?.width ?? window.innerWidth;
    const viewportRight = viewportLeft + viewportWidth;

    type Offender = {
      selector: string;
      tag: string;
      id: string;
      dataAttrs: string;
      left: number;
      right: number;
      width: number;
      height: number;
      overflowPx: number;
      side: 'left' | 'right' | 'both';
      computedWidth: string;
      marginLeft: string;
      marginRight: string;
      transform: string;
      position: string;
      overflow: string;
      overflowX: string;
      minWidth: string;
      maxWidth: string;
      boxSizing: string;
      borderLeftWidth: string;
      borderRightWidth: string;
      paddingLeft: string;
      paddingRight: string;
      scrollWidth: number;
      clientWidth: number;
      internalScrollOverflow: number;
    };

    function describe(element: HTMLElement): Offender['selector'] {
      if (element === root) return 'html';
      if (element === body) return 'body';
      if (element.dataset.pfMobileNav !== undefined) return '[data-pf-mobile-nav]';
      if (element.dataset.pfQuickCreate) return `[data-pf-quick-create="${element.dataset.pfQuickCreate}"]`;
      if (element.dataset.pfShell) return `[data-pf-shell="${element.dataset.pfShell}"]`;
      if (element.dataset.pfProjectTabs !== undefined) return '[data-pf-project-tabs]';
      if (element.dataset.pfWorkKindFilter !== undefined) return '[data-pf-work-kind-filter]';
      if (element.dataset.pfDashboardQuickAccess !== undefined) return '[data-pf-dashboard-quick-access]';
      if (element.matches('a[href="#main"]')) return 'a[href="#main"]';
      if (element.id) return `#${element.id}`;
      const tag = element.tagName.toLowerCase();
      const cls =
        typeof element.className === 'string'
          ? element.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
          : '';
      return cls ? `${tag}.${cls}` : tag;
    }

    function dataAttrs(element: HTMLElement): string {
      return Object.entries(element.dataset)
        .map(([key, value]) => `data-${key}=${value ?? ''}`)
        .slice(0, 4)
        .join(' ');
    }

    const offenders: Offender[] = [];
    const scrollWidthOffenders: Offender[] = [];
    let maxRightOverflowPx = 0;
    let maxLeftOverflowPx = 0;

    const nodes: HTMLElement[] = [root, body, ...Array.from(document.querySelectorAll<HTMLElement>('*'))];

    for (const element of nodes) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const leftOverflow = viewportLeft - rect.left;
      const rightOverflow = rect.right - viewportRight;
      const hasViewportOverflow = leftOverflow > 0.1 || rightOverflow > 0.1;
      const internalScrollOverflow = element.scrollWidth - element.clientWidth;

      const base = {
        selector: describe(element),
        tag: element.tagName.toLowerCase(),
        id: element.id,
        dataAttrs: dataAttrs(element),
        left: Math.round(rect.left * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        overflowPx: 0,
        side: 'right' as const,
        computedWidth: style.width,
        marginLeft: style.marginLeft,
        marginRight: style.marginRight,
        transform: style.transform,
        position: style.position,
        overflow: style.overflow,
        overflowX: style.overflowX,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth,
        boxSizing: style.boxSizing,
        borderLeftWidth: style.borderLeftWidth,
        borderRightWidth: style.borderRightWidth,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        internalScrollOverflow,
      };

      if (hasViewportOverflow) {
        const overflowPx = Math.max(leftOverflow > 0.1 ? leftOverflow : 0, rightOverflow > 0.1 ? rightOverflow : 0);
        maxLeftOverflowPx = Math.max(maxLeftOverflowPx, leftOverflow > 0.1 ? leftOverflow : 0);
        maxRightOverflowPx = Math.max(maxRightOverflowPx, rightOverflow > 0.1 ? rightOverflow : 0);
        offenders.push({
          ...base,
          overflowPx: Math.round(overflowPx * 100) / 100,
          side:
            leftOverflow > 0.1 && rightOverflow > 0.1
              ? 'both'
              : leftOverflow > 0.1
                ? 'left'
                : 'right',
        });
      }

      if (
        internalScrollOverflow > 1 &&
        element.clientWidth > 0 &&
        (style.overflowX === 'visible' || style.overflow === 'visible')
      ) {
        scrollWidthOffenders.push({
          ...base,
          overflowPx: internalScrollOverflow,
          side: 'right',
        });
      }
    }

    offenders.sort((a, b) => b.overflowPx - a.overflowPx);
    scrollWidthOffenders.sort((a, b) => b.internalScrollOverflow - a.internalScrollOverflow);

    const documentScrollMismatchPx = root.scrollWidth - root.clientWidth;

    return {
      innerWidth: window.innerWidth,
      visualViewportWidth: viewportWidth,
      visualViewportOffsetLeft: viewportLeft,
      documentClientWidth: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      documentScrollMismatchPx,
      maxRightOverflowPx: Math.round(maxRightOverflowPx * 100) / 100,
      maxLeftOverflowPx: Math.round(maxLeftOverflowPx * 100) / 100,
      topOffender: offenders[0] ?? null,
      offenders: offenders.slice(0, 20),
      scrollWidthOffenders: scrollWidthOffenders.slice(0, 10),
    };
  });
}

/** Simulate Android layout-vs-visual viewport width gap (common on real devices). */
export async function runMobileOverflowDeepAuditSimulatedAndroid(
  page: Page,
  visualWidthDelta = 0,
): Promise<MobileOverflowDeepAudit & { simulatedVisualWidth: number }> {
  return page.evaluate((delta) => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    const viewportLeft = vv?.offsetLeft ?? 0;
    const viewportWidth = Math.max(0, (vv?.width ?? window.innerWidth) + delta);
    const viewportRight = viewportLeft + viewportWidth;

    type Offender = MobileOverflowDeepAudit['offenders'][number];

    function describe(element: HTMLElement): string {
      if (element === root) return 'html';
      if (element === body) return 'body';
      if (element.dataset.pfMobileNav !== undefined) return '[data-pf-mobile-nav]';
      if (element.dataset.pfQuickCreate) return `[data-pf-quick-create="${element.dataset.pfQuickCreate}"]`;
      if (element.dataset.pfShell) return `[data-pf-shell="${element.dataset.pfShell}"]`;
      if (element.id) return `#${element.id}`;
      const tag = element.tagName.toLowerCase();
      const cls =
        typeof element.className === 'string'
          ? element.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
          : '';
      return cls ? `${tag}.${cls}` : tag;
    }

    function dataAttrs(element: HTMLElement): string {
      return Object.entries(element.dataset)
        .map(([key, value]) => `data-${key}=${value ?? ''}`)
        .slice(0, 4)
        .join(' ');
    }

    const offenders: Offender[] = [];
    let maxRightOverflowPx = 0;
    let maxLeftOverflowPx = 0;

    const nodes: HTMLElement[] = [root, body, ...Array.from(document.querySelectorAll<HTMLElement>('*'))];

    for (const element of nodes) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const leftOverflow = viewportLeft - rect.left;
      const rightOverflow = rect.right - viewportRight;
      if (leftOverflow <= 0.1 && rightOverflow <= 0.1) continue;

      const overflowPx = Math.max(leftOverflow > 0.1 ? leftOverflow : 0, rightOverflow > 0.1 ? rightOverflow : 0);
      maxLeftOverflowPx = Math.max(maxLeftOverflowPx, leftOverflow > 0.1 ? leftOverflow : 0);
      maxRightOverflowPx = Math.max(maxRightOverflowPx, rightOverflow > 0.1 ? rightOverflow : 0);

      offenders.push({
        selector: describe(element),
        tag: element.tagName.toLowerCase(),
        id: element.id,
        dataAttrs: dataAttrs(element),
        left: Math.round(rect.left * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        overflowPx: Math.round(overflowPx * 100) / 100,
        side:
          leftOverflow > 0.1 && rightOverflow > 0.1 ? 'both' : leftOverflow > 0.1 ? 'left' : 'right',
        computedWidth: style.width,
        marginLeft: style.marginLeft,
        marginRight: style.marginRight,
        transform: style.transform,
        position: style.position,
        overflow: style.overflow,
        overflowX: style.overflowX,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth,
        boxSizing: style.boxSizing,
        borderLeftWidth: style.borderLeftWidth,
        borderRightWidth: style.borderRightWidth,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        internalScrollOverflow: element.scrollWidth - element.clientWidth,
      });
    }

    offenders.sort((a, b) => b.overflowPx - a.overflowPx);

    return {
      innerWidth: window.innerWidth,
      visualViewportWidth: viewportWidth,
      visualViewportOffsetLeft: viewportLeft,
      documentClientWidth: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      documentScrollMismatchPx: root.scrollWidth - root.clientWidth,
      maxRightOverflowPx: Math.round(maxRightOverflowPx * 100) / 100,
      maxLeftOverflowPx: Math.round(maxLeftOverflowPx * 100) / 100,
      topOffender: offenders[0] ?? null,
      offenders: offenders.slice(0, 20),
      scrollWidthOffenders: [],
      simulatedVisualWidth: viewportWidth,
    };
  }, visualWidthDelta);
}

export async function outlineOverflowOffenders(page: Page): Promise<void> {
  await page.evaluate(() => {
    const vv = window.visualViewport;
    const viewportLeft = vv?.offsetLeft ?? 0;
    const viewportWidth = vv?.width ?? window.innerWidth;
    const viewportRight = viewportLeft + viewportWidth;

    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const rect = element.getBoundingClientRect();
      const leftOverflow = viewportLeft - rect.left;
      const rightOverflow = rect.right - viewportRight;
      if (leftOverflow > 0.1 || rightOverflow > 0.1) {
        element.style.outline = '2px solid red';
        element.dataset.pfOverflowOffender = `${Math.max(leftOverflow, rightOverflow).toFixed(2)}`;
      }
    }
  });
}

export { buildSelector };
