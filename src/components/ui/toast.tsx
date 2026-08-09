'use client';

import * as React from 'react';
import { cn } from '@/shared/ui/cn';

export type ToastTone = 'info' | 'success' | 'danger';

export interface ToastItem {
  readonly id: string;
  readonly message: string;
  readonly tone: ToastTone;
}

type ToastContextValue = {
  push: (message: string, tone?: ToastTone) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

/** Optional: returns null outside provider so export buttons can degrade to silent. */
export function useOptionalToast(): ToastContextValue | null {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const push = React.useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--pf-bottomnav-height)+1rem+env(safe-area-inset-bottom,0px))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'danger' ? 'alert' : 'status'}
            aria-live={toast.tone === 'danger' ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto max-w-sm rounded-md px-4 py-3 text-sm shadow-[var(--pf-shadow-lg)]',
              'border text-start',
              toast.tone === 'success' &&
                'border-[var(--pf-status-success-border)] bg-[var(--pf-status-success-bg)] text-[var(--pf-status-success-fg)]',
              toast.tone === 'danger' &&
                'border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] text-[var(--pf-status-danger-fg)]',
              toast.tone === 'info' &&
                'border-[var(--pf-border-default)] bg-[var(--pf-bg-elevated)] text-[var(--pf-text-primary)]',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
