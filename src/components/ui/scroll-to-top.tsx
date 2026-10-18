'use client';

import { ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { useLocaleDir } from '@/shared/i18n/direction';
import { usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

const SCROLL_THRESHOLD_PX = 400;

const SCROLL_REGION_ATTRS = [
  'data-pf-employee-board-scroll',
  'data-pf-plan-viewer',
  'data-pf-cad-viewer',
] as const;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

/** Document or body marks an independent scroll surface (board, plan/CAD viewers). */
export function hasIndependentScrollRegion(): boolean {
  if (typeof document === 'undefined') return false;
  for (const attr of SCROLL_REGION_ATTRS) {
    if (document.querySelector(`[${attr}]`)) return true;
    if (document.documentElement.hasAttribute(attr) || document.body.hasAttribute(attr)) return true;
  }
  return false;
}

/** Pathname fallback when scroll-region markers are not yet in the DOM. */
export function isIndependentScrollPathname(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? pathname;
  if (/\/board(\/|$)/.test(path)) return true;
  if (/\/cad(\/|$)/i.test(path) || /\/pf-cad(\/|$)/i.test(path)) return true;
  if (/\/plans\/[^/]+\/?$/.test(path)) return true;
  if (/plan-viewer/i.test(path)) return true;
  return false;
}

export function shouldSuppressScrollToTop(pathname: string): boolean {
  return isIndependentScrollPathname(pathname) || hasIndependentScrollRegion();
}

/**
 * Floating control to scroll the document back to the top.
 * Hidden on routes/regions that use nested scroll containers (boards, viewers).
 */
export function ScrollToTop() {
  const t = useTranslations('common');
  const localeDir = useLocaleDir();
  const pathname = usePathname();
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  const [visible, setVisible] = useState(false);

  const evaluateVisibility = useCallback(() => {
    if (shouldSuppressScrollToTop(pathname)) {
      setVisible(false);
      return;
    }
    setVisible(window.scrollY >= SCROLL_THRESHOLD_PX);
  }, [pathname]);

  useEffect(() => {
    evaluateVisibility();
    window.addEventListener('scroll', evaluateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', evaluateVisibility);
  }, [evaluateVisibility]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => evaluateVisibility());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [...SCROLL_REGION_ATTRS],
    });
    return () => observer.disconnect();
  }, [evaluateVisibility]);

  if (!visible) return null;

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={t('a11y.scrollToTop')}
      className={cn(
        pressableChromeClassName,
        'fixed z-40 flex size-10 items-center justify-center rounded-full',
        'border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-secondary)] shadow-[var(--pf-shadow-md)]',
        'hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        localeDir === 'rtl' ? 'right-4' : 'left-4',
        'bottom-[calc(var(--pf-bottomnav-total-height)+var(--pf-fab-gap)+3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-[calc(var(--pf-fab-gap)+3.5rem+env(safe-area-inset-bottom,0px))]',
      )}
    >
      <ChevronUp className="size-5" aria-hidden />
    </button>
  );
}
