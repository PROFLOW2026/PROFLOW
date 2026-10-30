'use client';

import { useCallback } from 'react';

/** Guards dialog close when `dirty`; uses `window.confirm` (same contract as employee switcher). */
export function useDialogUnsavedGuard(options: {
  readonly dirty: boolean;
  readonly confirmMessage: string;
  readonly onOpenChange: (open: boolean) => void;
}): (open: boolean) => void {
  const { dirty, confirmMessage, onOpenChange } = options;
  return useCallback(
    (open: boolean) => {
      if (!open && dirty && typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
        return;
      }
      onOpenChange(open);
    },
    [dirty, confirmMessage, onOpenChange],
  );
}

/** Returns false to prevent collapse when the user declines the unsaved prompt. */
export function useCollapseUnsavedGuard(options: {
  readonly dirty: boolean;
  readonly confirmMessage: string;
}): (nextOpen: boolean) => boolean {
  const { dirty, confirmMessage } = options;
  return useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && dirty && typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
        return false;
      }
      return true;
    },
    [dirty, confirmMessage],
  );
}
