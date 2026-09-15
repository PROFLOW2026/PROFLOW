'use client';

import { useEffect } from 'react';
import {
  clearVisualViewportBottomOffset,
  syncVisualViewportBottomOffset,
} from '@/shared/ui/visual-viewport-chrome';

/**
 * Keeps `--pf-visual-viewport-bottom-offset` in sync with mobile browser chrome.
 * Mount once inside AppShell (lg+ listeners are cheap no-ops when offset stays 0).
 */
export function MobileShellViewportSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      syncVisualViewportBottomOffset();
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      clearVisualViewportBottomOffset();
    };
  }, []);

  return null;
}
