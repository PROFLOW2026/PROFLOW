import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR,
  VISUAL_VIEWPORT_OFFSET_LEFT_VAR,
  VISUAL_VIEWPORT_WIDTH_VAR,
  applyVisualViewportChrome,
  syncVisualViewportChromeWithFeedback,
} from '@/shared/ui/visual-viewport-chrome';

describe('visual viewport chrome sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR);
    document.documentElement.style.removeProperty(VISUAL_VIEWPORT_WIDTH_VAR);
    document.documentElement.style.removeProperty(VISUAL_VIEWPORT_OFFSET_LEFT_VAR);
    document.querySelector('[data-pf-mobile-nav]')?.remove();
  });

  it('writes width, offset-left, and bottom offset CSS variables', () => {
    applyVisualViewportChrome({
      bottomOffset: 5,
      width: 384,
      offsetLeft: 3,
      safetyInset: 2,
    });

    expect(document.documentElement.style.getPropertyValue(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR)).toBe(
      '5px',
    );
    expect(document.documentElement.style.getPropertyValue(VISUAL_VIEWPORT_WIDTH_VAR)).toBe('384px');
    expect(document.documentElement.style.getPropertyValue(VISUAL_VIEWPORT_OFFSET_LEFT_VAR)).toBe(
      '3px',
    );
  });

  it('adds feedback correction when nav overshoots visual viewport bottom', async () => {
    const nav = document.createElement('nav');
    nav.setAttribute('data-pf-mobile-nav', '');
    nav.getBoundingClientRect = () =>
      ({
        bottom: 803,
        top: 739,
        left: 0,
        right: 390,
        width: 390,
        height: 64,
        x: 0,
        y: 739,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(nav);

    vi.stubGlobal('matchMedia', () => ({ matches: true, media: '' }));
    vi.stubGlobal('window', {
      ...window,
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: { width: 390, height: 800, offsetTop: 0, offsetLeft: 0 },
      matchMedia: () => ({ matches: true, media: '' }),
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    });

    syncVisualViewportChromeWithFeedback();
    await Promise.resolve();

    expect(
      parseFloat(
        document.documentElement.style.getPropertyValue(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR),
      ),
    ).toBeGreaterThanOrEqual(7);
  });
});
