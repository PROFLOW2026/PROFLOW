'use client';

import type { ReactNode, RefObject } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/shared/ui/cn';

export interface FormDialogFooterProps {
  readonly cancelLabel: string;
  readonly onCancel?: () => void;
  readonly cancelDisabled?: boolean;
  readonly submitLabel: string;
  readonly submitType?: 'button' | 'submit';
  readonly onSubmit?: () => void;
  readonly submitLoading?: boolean;
  readonly submitDisabled?: boolean;
  readonly submitVariant?: ButtonProps['variant'];
  readonly className?: string;
  readonly trailing?: ReactNode;
  readonly cancelRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * Standard dialog footer: Cancel (secondary) + primary action with loading.
 * Use inside `DialogContent` for form and confirm-family dialogs (wave 3).
 */
export function FormDialogFooter({
  cancelLabel,
  onCancel,
  cancelDisabled = false,
  submitLabel,
  submitType = 'button',
  onSubmit,
  submitLoading = false,
  submitDisabled = false,
  submitVariant = 'primary',
  className,
  trailing,
  cancelRef,
}: FormDialogFooterProps) {
  return (
    <DialogFooter className={cn(className)}>
      <Button
        ref={cancelRef}
        type="button"
        variant="secondary"
        disabled={cancelDisabled || submitLoading}
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
      <Button
        type={submitType}
        variant={submitVariant}
        loading={submitLoading}
        disabled={submitDisabled}
        onClick={submitType === 'button' ? onSubmit : undefined}
      >
        {submitLabel}
      </Button>
      {trailing}
    </DialogFooter>
  );
}
