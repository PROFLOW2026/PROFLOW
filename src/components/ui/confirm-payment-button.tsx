'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              disabled={pending || !paidAt}
              onClick={() => {
                startTransition(async () => {
                  await onConfirm(paidAt);
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
