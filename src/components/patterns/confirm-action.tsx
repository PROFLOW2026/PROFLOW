'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface ConfirmActionResult {
  readonly error?: string;
  readonly ok?: boolean;
}

export interface ConfirmActionProps {
  /** Element that opens the dialog (typically a Button). */
  trigger: React.ReactElement;
  /** Short dialog title naming the action. */
  title: string;
  /** Explains the specific record and irreversible consequence. */
  description: React.ReactNode;
  /** Destructive confirm button label. */
  confirmLabel: string;
  /** Runs when the user confirms; return `{ error }` to surface failure. */
  onConfirm: () => Promise<ConfirmActionResult | void>;
  /** Success Alert body when the action completes. */
  successMessage: string;
  /** Accessible name for the trigger when visible text is not unique. */
  triggerAriaLabel?: string;
}

export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  successMessage,
  triggerAriaLabel,
}: ConfirmActionProps) {
  const tCommon = useTranslations('common');
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  function resetOutcome() {
    setOutcome('idle');
    setErrorMessage(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetOutcome();
      setPending(false);
    }
  }

  async function handleConfirm() {
    setPending(true);
    resetOutcome();

    try {
      const result = await onConfirm();
      if (result?.error) {
        setOutcome('error');
        setErrorMessage(result.error);
        return;
      }
      setOutcome('success');
    } catch {
      setOutcome('error');
      setErrorMessage(tCommon('states.errorHint'));
    } finally {
      setPending(false);
    }
  }

  const triggerElement = triggerAriaLabel
    ? React.cloneElement(trigger, { 'aria-label': triggerAriaLabel } as React.HTMLAttributes<HTMLElement>)
    : trigger;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{triggerElement}</DialogTrigger>
      <DialogContent
        closeLabel={tCommon('actions.close')}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">{description}</div>
          </DialogDescription>
        </DialogHeader>

        {outcome !== 'idle' ? (
          <DialogBody className="py-0 pb-4">
            {outcome === 'error' && errorMessage ? (
              <Alert tone="danger">{errorMessage}</Alert>
            ) : null}
            {outcome === 'success' ? (
              <Alert tone="success" role="status" aria-live="polite">
                {successMessage}
              </Alert>
            ) : null}
          </DialogBody>
        ) : null}

        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            {tCommon('actions.cancel')}
          </Button>
          <Button type="button" variant="danger" loading={pending} onClick={() => void handleConfirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
