'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Alert, type AlertTone } from '@/components/ui/alert';
import { pressableClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export type StatusToastTone = Extract<AlertTone, 'info' | 'success' | 'danger'>;

export interface StatusToastProps {
  open: boolean;
  tone: StatusToastTone;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

const emptySubscribe = () => () => {};

/**
 * Minimal product status toast — fixed region using Alert design tokens.
 * Client mount uses useSyncExternalStore (no setState-in-effect).
 */
export function StatusToast({ open, tone, message, onDismiss, className }: StatusToastProps) {
  const t = useTranslations('common');
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  React.useEffect(() => {
    if (!open || tone === 'danger') return;
    const timer = window.setTimeout(() => onDismiss?.(), 4000);
    return () => window.clearTimeout(timer);
  }, [open, tone, onDismiss, message]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4',
        'bottom-[calc(var(--pf-bottomnav-height)+1rem+env(safe-area-inset-bottom,0px))] lg:bottom-6',
        className,
      )}
      data-pf-status-toast=""
    >
      <Alert
        tone={tone}
        role={tone === 'danger' ? 'alert' : 'status'}
        aria-live={tone === 'danger' ? 'assertive' : 'polite'}
        className="pointer-events-auto max-w-md shadow-[var(--pf-shadow-md)]"
      >
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-start">{message}</p>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className={cn(
                pressableClassName,
                'shrink-0 rounded-md p-1 text-current opacity-70 hover:opacity-100 active:opacity-100 active:bg-[rgb(0_0_0/0.06)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
              )}
              aria-label={t('actions.close')}
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </Alert>
    </div>,
    document.body,
  );
}
