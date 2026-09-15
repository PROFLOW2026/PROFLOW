/** CSS variable synced from Visual Viewport API for mobile browser chrome. */
export const VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR = '--pf-visual-viewport-bottom-offset';

/**
 * Distance from layout viewport bottom to visual viewport bottom.
 * Lifts fixed bottom chrome when mobile browser toolbars overlap content.
 */
export function computeVisualViewportBottomOffset(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

export function syncVisualViewportBottomOffset(): number {
  const offset = computeVisualViewportBottomOffset();
  document.documentElement.style.setProperty(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR, `${offset}px`);
  return offset;
}

export function clearVisualViewportBottomOffset(): void {
  document.documentElement.style.removeProperty(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR);
}

export type VisualViewportMetrics = {
  innerWidth: number;
  innerHeight: number;
  clientWidth: number;
  scrollWidth: number;
  visualViewportBottomOffset: number;
  offenders: Array<{ selector: string; left: number; right: number; width: number }>;
};

/** Debug helper for mobile overflow audits (tests / scripts). */
export function measureMobilePageOverflow(): VisualViewportMetrics {
  const root = document.documentElement;
  const viewportWidth = window.innerWidth;
  const offenders: VisualViewportMetrics['offenders'] = [];

  for (const element of document.querySelectorAll<HTMLElement>('body *')) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.left >= -1 && rect.right <= viewportWidth + 1) continue;

    const selector =
      element.dataset.pfMobileNav !== undefined
        ? '[data-pf-mobile-nav]'
        : element.dataset.pfQuickCreate
          ? `[data-pf-quick-create="${element.dataset.pfQuickCreate}"]`
          : element.tagName.toLowerCase() +
            (element.id ? `#${element.id}` : '') +
            (element.className && typeof element.className === 'string'
              ? `.${element.className.split(/\s+/).slice(0, 2).join('.')}`
              : '');

    offenders.push({
      selector,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
    });
    if (offenders.length >= 12) break;
  }

  return {
    innerWidth: viewportWidth,
    innerHeight: window.innerHeight,
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    visualViewportBottomOffset: computeVisualViewportBottomOffset(),
    offenders,
  };
}
