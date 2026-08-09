'use client';

import * as React from 'react';

/**
 * Immediate pending feedback for query-param tab switches (project workspace).
 *
 * Optimistic selection updates on click; `startTransition` wraps the soft
 * navigation so `isPending` stays true until the RSC payload for the new tab
 * settles. Same interaction idea as `ShellNavLink`, without requiring `<Link>`.
 */
export function useQueryTabPending(activeTab: string) {
  const [isPending, startTransition] = React.useTransition();
  const [optimisticTab, setOptimisticTab] = React.useState<string | null>(null);
  const [seenActiveTab, setSeenActiveTab] = React.useState(activeTab);

  // Clear optimistic chrome when the URL/tab from the server catches up.
  if (activeTab !== seenActiveTab) {
    setSeenActiveTab(activeTab);
    if (optimisticTab !== null && optimisticTab === activeTab) {
      setOptimisticTab(null);
    }
  }

  const displayTab = optimisticTab ?? activeTab;

  React.useEffect(() => {
    if (optimisticTab === null) return;
    const timer = window.setTimeout(() => setOptimisticTab(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [optimisticTab]);

  function navigateTab(next: string, navigate: () => void) {
    if (next === displayTab) return;
    setOptimisticTab(next);
    startTransition(navigate);
  }

  return {
    displayTab,
    isPending: isPending || (optimisticTab !== null && optimisticTab !== activeTab),
    navigateTab,
  };
}
