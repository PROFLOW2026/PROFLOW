import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR,
  syncVisualViewportBottomOffset,
} from '@/shared/ui/visual-viewport-chrome';

describe('visual viewport chrome sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR);
  });

  it('syncs CSS variable on documentElement', () => {
    vi.stubGlobal('window', {
      innerHeight: 844,
      visualViewport: { height: 844, offsetTop: 0 },
    });

    expect(syncVisualViewportBottomOffset()).toBe(0);
    expect(document.documentElement.style.getPropertyValue(VISUAL_VIEWPORT_BOTTOM_OFFSET_VAR)).toBe(
      '0px',
    );
  });
});
