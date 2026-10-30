'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { useState, useTransition } from 'react';
import { FormDialogFooter } from '@/components/patterns/form-dialog-footer';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ConfirmPaymentButton({
  label,
  paymentDateLabel,
  paymentDateHint,
  confirmLabel,
  cancelLabel,
  defaultPaymentDate,
  disabled,
  onConfirm,
}: {
  readonly label: string;
  readonly paymentDateLabel: string;
  readonly paymentDateHint: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly defaultPaymentDate: string;
  readonly disabled?: boolean;
  readonly onConfirm: (paidAt: string) => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(defaultPaymentDate);
  const [pending, startTransition] = useTransition();

  function handleOpen() {
    setPaidAt(defaultPaymentDate);
    setOpen(true);
  }

  return (
    <>
      <Button type="button" size="sm" disabled={disabled || pending} onClick={handleOpen}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{paymentDateHint}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex min-w-0 flex-col gap-4">
            <Field label={paymentDateLabel} required>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="date"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                />
              )}
            </Field>
          </DialogBody>
          <FormDialogFooter
            cancelLabel={cancelLabel}
            onCancel={() => setOpen(false)}
            cancelDisabled={pending}
            submitLabel={confirmLabel}
            submitDisabled={!paidAt}
            submitLoading={pending}
            onSubmit={() => {
              startTransition(async () => {
                await onConfirm(paidAt);
                setOpen(false);
                router.refresh();
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
