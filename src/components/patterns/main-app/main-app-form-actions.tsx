'use client';

import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface MainAppFormActionsProps {
  readonly cancelLabel?: string;
  readonly cancelHref?: string;
  readonly onCancel?: () => void;
  readonly cancelDisabled?: boolean;
  readonly submitLabel: string;
  readonly submitType?: 'button' | 'submit';
  readonly onSubmit?: () => void;
  readonly submitLoading?: boolean;
  readonly submitDisabled?: boolean;
  readonly submitVariant?: ButtonProps['variant'];
  readonly sticky?: boolean;
  readonly className?: string;
  readonly trailing?: ReactNode;
}

/**
 * Standard main-app form footer: Cancel (secondary) + primary save/submit with loading.
 * Mobile: primary on top (`flex-col-reverse`); sm+: actions row aligned to inline end.
 */
export function MainAppFormActions({
  cancelLabel,
  cancelHref,
  onCancel,
  cancelDisabled = false,
  submitLabel,
  submitType = 'submit',
  onSubmit,
  submitLoading = false,
  submitDisabled = false,
  submitVariant = 'primary',
  sticky = false,
  className,
  trailing,
}: MainAppFormActionsProps) {
  const showCancel = Boolean(cancelHref || onCancel);
  const cancelBlocked = cancelDisabled || submitLoading;

  const cancelClassName = 'w-full min-w-0 sm:w-auto';

  return (
    <div
      data-pf-ma-form-actions=""
      className={cn(
        'flex w-full min-w-0 flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end',
        sticky &&
          'sticky bottom-[calc(var(--pf-bottomnav-total-height,0px)+0.5rem)] z-10 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] pt-3 sm:static sm:border-t-0 sm:bg-transparent sm:pt-0',
        className,
      )}
    >
      {showCancel && cancelHref && cancelLabel ? (
        cancelBlocked ? (
          <Button type="button" variant="secondary" className={cancelClassName} disabled>
            {cancelLabel}
          </Button>
        ) : (
          <Button asChild variant="secondary" className={cancelClassName}>
            <Link href={cancelHref}>{cancelLabel}</Link>
          </Button>
        )
      ) : null}
      {showCancel && onCancel && cancelLabel && !cancelHref ? (
        <Button
          type="button"
          variant="secondary"
          className={cancelClassName}
          disabled={cancelBlocked}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
      ) : null}
      <Button
        type={submitType}
        variant={submitVariant}
        loading={submitLoading}
        disabled={submitDisabled}
        className="w-full min-w-0 sm:w-auto sm:min-w-32"
        onClick={submitType === 'button' ? onSubmit : undefined}
      >
        {submitLabel}
      </Button>
      {trailing}
    </div>
  );
}
