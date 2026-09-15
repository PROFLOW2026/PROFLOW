'use client';

import { useEffect } from 'react';
import {
  clearVisualViewportChrome,
  syncVisualViewportChromeWithFeedback,
} from '@/shared/ui/visual-viewport-chrome';

/**
 * Keeps visual-viewport CSS vars in sync for portaled mobile shell chrome.
 * Uses a post-paint feedback pass to correct bottom HUD clipping on Android.
 */
export function MobileShellViewportSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      syncVisualViewportChromeWithFeedback();
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('scroll', update, { passive: true });

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('scroll', update);
      clearVisualViewportChrome();
    };
  }, []);

  return null;
}
