'use client';

import { Info } from 'lucide-react';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { pressableClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export interface ContextualInfoProps {
  /** Dialog heading — falls back to `common.contextualInfo.dialogFallbackTitle`. */
  dialogTitle?: string;
  content: React.ReactNode;
  className?: string;
  /** Accessible name for the trigger when `dialogTitle` is missing or non-text. */
  triggerLabel?: string;
  /** Smaller trigger for dense KPI / filter rows. */
  size?: 'default' | 'sm';
}

/** Compact info (i) trigger — explanation lives in a unified mobile-first dialog. */
export function ContextualInfo({
  dialogTitle,
  content,
  className,
  triggerLabel,
  size = 'default',
}: ContextualInfoProps) {
  const t = useTranslations('common.contextualInfo');
  const [open, setOpen] = React.useState(false);
  const resolvedTitle = dialogTitle ?? t('dialogFallbackTitle');
  const ariaLabel = triggerLabel ?? t('openAbout', { subject: resolvedTitle });

  const triggerSizeClass =
    size === 'sm'
      ? 'size-7 min-h-7 min-w-7'
      : 'size-8 min-h-8 min-w-8';

  return (
    <>
      <button
        type="button"
        className={cn(
          pressableClassName,
          'inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--pf-border-default)]',
          'text-[var(--pf-text-muted)] hover:bg-[var(--pf-bg-subtle)] hover:text-[var(--pf-text-brand)]',
          triggerSizeClass,
          className,
        )}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        <Info className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent mobileSheet className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{resolvedTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2 text-sm text-[var(--pf-text-secondary)]">{content}</div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Field / filter group label with optional info dialog (no visible hint paragraph). */
export function ContextualInfoLabel({
  label,
  hint,
  hintTitle,
  className,
}: {
  readonly label: React.ReactNode;
  readonly hint: React.ReactNode;
  readonly hintTitle?: string;
  readonly className?: string;
}) {
  const title =
    hintTitle ?? (typeof label === 'string' ? label : undefined);

  return (
    <div className={cn('mb-2 flex min-w-0 items-center gap-1', className)}>
      <span className="text-xs font-semibold text-[var(--pf-text-secondary)]">{label}</span>
      <ContextualInfo dialogTitle={title} content={hint} size="sm" />
    </div>
  );
}
