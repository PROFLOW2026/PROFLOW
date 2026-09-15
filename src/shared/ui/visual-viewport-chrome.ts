/** CSS variables synced from Visual Viewport API for mobile shell chrome. */
export const VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR = '--pf-visual-viewport-bottom-offset';
export const VISUAL_VIEWPORT_WIDTH_VAR = '--pf-visual-viewport-width';
export const VISUAL_VIEWPORT_OFFSET_LEFT_VAR = '--pf-visual-viewport-offset-left';
export const MOBILE_CHROME_SAFETY_VAR = '--pf-mobile-chrome-safety-inset';

/** Subpixel guard for Android browser/system nav when safe-area env is 0. */
export const MOBILE_CHROME_BOTTOM_SAFETY_PX = 2;

export type VisualViewportChrome = {
  bottomOffset: number;
  width: number;
  offsetLeft: number;
  safetyInset: number;
};

export type MobileShellOverflowAudit = {
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
  offenders: Array<{
    selector: string;
    left: number;
    right: number;
    overflowPx: number;
  }>;
};

function isMobileShellViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 1023px)').matches;
}

/**
 * Distance from layout viewport bottom to visual viewport bottom,
 * plus a small mobile safety inset for Android subpixel chrome.
 */
export function computeVisualViewportChrome(): VisualViewportChrome {
  if (typeof window === 'undefined') {
    return { bottomOffset: 0, width: 0, offsetLeft: 0, safetyInset: 0 };
  }

  const vv = window.visualViewport;
  const innerWidth = window.innerWidth;
  const innerHeight = window.innerHeight;

  if (!vv) {
    const safetyInset = isMobileShellViewport() ? MOBILE_CHROME_BOTTOM_SAFETY_PX : 0;
    return {
      bottomOffset: safetyInset,
      width: innerWidth,
      offsetLeft: 0,
      safetyInset,
    };
  }

  const rawBottom = Math.max(0, innerHeight - vv.offsetTop - vv.height);
  const safetyInset = isMobileShellViewport() ? MOBILE_CHROME_BOTTOM_SAFETY_PX : 0;

  return {
    bottomOffset: rawBottom + safetyInset,
    // Floor width so fixed shell chrome never exceeds visual viewport on Android/RTL subpixels.
    width: Math.max(0, Math.floor(vv.width)),
    offsetLeft: Math.max(0, vv.offsetLeft),
    safetyInset,
  };
}

export function applyVisualViewportChrome(chrome: VisualViewportChrome): void {
  const root = document.documentElement;
  root.style.setProperty(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR, `${chrome.bottomOffset}px`);
  root.style.setProperty(VISUAL_VIEWPORT_WIDTH_VAR, `${chrome.width}px`);
  root.style.setProperty(VISUAL_VIEWPORT_OFFSET_LEFT_VAR, `${chrome.offsetLeft}px`);
  root.style.setProperty(MOBILE_CHROME_SAFETY_VAR, `${chrome.safetyInset}px`);
}

/** How far nav bottom extends below the visual viewport bottom (positive = clipped). */
export function measureNavVisualViewportOvershoot(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const vv = window.visualViewport;
  const nav = document.querySelector<HTMLElement>('[data-pf-mobile-nav]');
  if (!vv || !nav) return 0;

  const navRect = nav.getBoundingClientRect();
  const vvBottom = vv.offsetTop + vv.height;
  return navRect.bottom - vvBottom;
}

export function readVisualViewportBottomOffsetPx(): number {
  const root = document.documentElement;
  const raw =
    root.style.getPropertyValue(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR) ||
    getComputedStyle(root).getPropertyValue(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR);
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function syncVisualViewportChrome(): VisualViewportChrome {
  const chrome = computeVisualViewportChrome();
  applyVisualViewportChrome(chrome);
  return chrome;
}

/**
 * Apply chrome vars, then nudge bottom offset if measured nav still clips visual viewport.
 */
export function syncVisualViewportChromeWithFeedback(): VisualViewportChrome {
  const chrome = syncVisualViewportChrome();
  if (typeof requestAnimationFrame === 'undefined') return chrome;

  requestAnimationFrame(() => {
    const overshoot = measureNavVisualViewportOvershoot();
    if (overshoot <= 0.5) return;

    const current = readVisualViewportBottomOffsetPx();
    const extra = Math.ceil(overshoot) + 1;
    document.documentElement.style.setProperty(
      VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR,
      `${current + extra}px`,
    );
  });

  return chrome;
}

function describeOverflowElement(element: HTMLElement): string {
  if (element.dataset.pfMobileNav !== undefined) return '[data-pf-mobile-nav]';
  if (element.dataset.pfQuickCreate) {
    return `[data-pf-quick-create="${element.dataset.pfQuickCreate}"]`;
  }
  if (element.id) return `#${element.id}`;
  const tag = element.tagName.toLowerCase();
  const cls =
    typeof element.className === 'string'
      ? element.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      : '';
  return cls ? `${tag}.${cls}` : tag;
}

/** Enumerate elements extending past the visual viewport (RTL-safe). */
export function auditMobileShellOverflow(limit = 16): MobileShellOverflowAudit {
  const root = document.documentElement;
  const body = document.body;
  const vv = window.visualViewport;
  const viewportLeft = vv?.offsetLeft ?? 0;
  const viewportWidth = vv?.width ?? window.innerWidth;
  const viewportRight = viewportLeft + viewportWidth;

  let maxRightOverflowPx = 0;
  let maxLeftOverflowPx = 0;
  const offenders: MobileShellOverflowAudit['offenders'] = [];

  for (const element of document.querySelectorAll<HTMLElement>('body *')) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const leftOverflow = viewportLeft - rect.left;
    const rightOverflow = rect.right - viewportRight;
    if (leftOverflow <= 0.5 && rightOverflow <= 0.5) continue;

    const overflowPx = Math.max(leftOverflow > 0.5 ? leftOverflow : 0, rightOverflow > 0.5 ? rightOverflow : 0);
    maxLeftOverflowPx = Math.max(maxLeftOverflowPx, leftOverflow > 0.5 ? leftOverflow : 0);
    maxRightOverflowPx = Math.max(maxRightOverflowPx, rightOverflow > 0.5 ? rightOverflow : 0);

    offenders.push({
      selector: describeOverflowElement(element),
      left: Math.round(rect.left * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      overflowPx: Math.round(overflowPx * 10) / 10,
    });
    if (offenders.length >= limit) break;
  }

  const nav = document.querySelector<HTMLElement>('[data-pf-mobile-nav]');
  const navRect = nav?.getBoundingClientRect();
  const vvBottom = vv ? vv.offsetTop + vv.height : null;

  return {
    innerWidth: window.innerWidth,
    visualViewportWidth: viewportWidth,
    documentClientWidth: root.clientWidth,
    documentScrollWidth: root.scrollWidth,
    bodyClientWidth: body.clientWidth,
    bodyScrollWidth: body.scrollWidth,
    visualViewportBottomOffset: readVisualViewportBottomOffsetPx(),
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
}

/** @deprecated use auditMobileShellOverflow */
export function measureMobilePageOverflow() {
  const audit = auditMobileShellOverflow();
  return {
    innerWidth: audit.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: audit.documentClientWidth,
    scrollWidth: audit.documentScrollWidth,
    visualViewportBottomOffset: audit.visualViewportBottomOffset,
    offenders: audit.offenders.map((item) => ({
      selector: item.selector,
      left: item.left,
      right: item.right,
      width: item.right - item.left,
    })),
  };
}

export function clearVisualViewportChrome(): void {
  const root = document.documentElement;
  root.style.removeProperty(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR);
  root.style.removeProperty(VISUAL_VIEWPORT_WIDTH_VAR);
  root.style.removeProperty(VISUAL_VIEWPORT_OFFSET_LEFT_VAR);
  root.style.removeProperty(MOBILE_CHROME_SAFETY_VAR);
}
