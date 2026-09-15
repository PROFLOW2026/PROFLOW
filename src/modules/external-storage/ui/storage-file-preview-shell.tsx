'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';

export function StorageFilePreviewShell({
  open,
  onClose,
  closeLabel,
  title,
  headerActions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  title: string;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={cn(
        'fixed z-[70] flex flex-col bg-[var(--pf-bg-elevated)] text-[var(--pf-text-primary)]',
        'inset-0 h-dvh w-screen max-h-dvh',
        'md:inset-auto md:left-1/2 md:top-1/2 md:h-[92vh] md:w-[92vw] md:max-h-[92vh] md:max-w-[92vw] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:border-[var(--pf-border-default)] md:shadow-[var(--pf-shadow-lg)]',
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--pf-border-default)] px-2 py-2 md:px-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={closeLabel}>
          <X className="size-5" aria-hidden />
        </Button>
        <p
          className="min-w-0 flex-1 truncate text-sm font-medium md:text-base"
          dir="ltr"
          style={{ unicodeBidi: 'isolate' }}
        >
          {title}
        </p>
        {headerActions ? <div className="flex shrink-0 items-center gap-1">{headerActions}</div> : null}
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>,
    document.body,
  );
}
