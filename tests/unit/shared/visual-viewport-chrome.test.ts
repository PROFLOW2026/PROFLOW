import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeVisualViewportBottomOffset } from '@/shared/ui/visual-viewport-chrome';

describe('visual viewport chrome', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('computes bottom offset from visual viewport metrics', () => {
    vi.stubGlobal('window', {
      innerHeight: 800,
      visualViewport: { height: 720, offsetTop: 40 },
    });

    expect(computeVisualViewportBottomOffset()).toBe(40);
  });

  it('returns zero when visual viewport fills layout viewport', () => {
    vi.stubGlobal('window', {
      innerHeight: 844,
      visualViewport: { height: 844, offsetTop: 0 },
    });

    expect(computeVisualViewportBottomOffset()).toBe(0);
  });

  it('never returns negative offset', () => {
    vi.stubGlobal('window', {
      innerHeight: 800,
      visualViewport: { height: 820, offsetTop: 0 },
    });

    expect(computeVisualViewportBottomOffset()).toBe(0);
  });
});
