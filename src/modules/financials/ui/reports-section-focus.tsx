'use client';

import { useEffect } from 'react';

/**
 * Scrolls the reports page to `?section=` without a second analytics surface.
 */
export function ReportsSectionFocus({ section }: { readonly section: string | null }) {
  useEffect(() => {
    if (!section) return;
    document.getElementById(`reports-${section}`)?.scrollIntoView({
      block: 'start',
      behavior: 'auto',
    });
  }, [section]);
  return null;
}
