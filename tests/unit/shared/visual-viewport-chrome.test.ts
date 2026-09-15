import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MOBILE_CHROME_BOTTOM_SAFETY_PX,
  VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR,
  VISUAL_VIEWPORT_OFFSET_LEFT_VAR,
  VISUAL_VIEWPORT_WIDTH_VAR,
  computeVisualViewportChrome,
  measureNavVisualViewportOvershoot,
} from '@/shared/ui/visual-viewport-chrome';

function stubMobileWindow(input: {
  innerWidth?: number;
  innerHeight?: number;
  vv?: { width: number; height: number; offsetTop: number; offsetLeft?: number };
  mobile?: boolean;
}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: input.mobile !== false && query.includes('max-width'),
    media: query,
  }));
  vi.stubGlobal('window', {
    innerWidth: input.innerWidth ?? 390,
    innerHeight: input.innerHeight ?? 844,
    visualViewport: input.vv,
    matchMedia: (query: string) => ({
      matches: input.mobile !== false && query.includes('max-width'),
      media: query,
    }),
  });
}

describe('visual viewport chrome', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses visual viewport width/offsetLeft instead of layout 100% width', () => {
    stubMobileWindow({
      innerHeight: 844,
      vv: { width: 384.5, height: 844, offsetTop: 0, offsetLeft: 2.5 },
    });

    expect(computeVisualViewportChrome()).toEqual({
      bottomOffset: MOBILE_CHROME_BOTTOM_SAFETY_PX,
      width: 384,
      offsetLeft: 2.5,
      safetyInset: MOBILE_CHROME_BOTTOM_SAFETY_PX,
    });
  });

  it('lifts bottom chrome when browser toolbar reduces visual viewport height', () => {
    stubMobileWindow({
      innerHeight: 844,
      vv: { width: 390, height: 780, offsetTop: 0, offsetLeft: 0 },
    });

    expect(computeVisualViewportChrome().bottomOffset).toBe(64 + MOBILE_CHROME_BOTTOM_SAFETY_PX);
  });

  it('measures nav overshoot below visual viewport bottom', () => {
    vi.stubGlobal('window', {
      visualViewport: { offsetTop: 0, height: 800 },
    });
    vi.stubGlobal('document', {
      querySelector: () => ({
        getBoundingClientRect: () => ({ bottom: 803.5 }),
      }),
    });

    expect(measureNavVisualViewportOvershoot()).toBe(3.5);
  });
});
