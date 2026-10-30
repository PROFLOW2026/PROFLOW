'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormDialogFooter } from '@/components/patterns/form-dialog-footer';

export interface ExpenseDestinationChangeConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

/** BH-01: shared confirm before leaving single-project destination (replaces window.confirm). */
export function ExpenseDestinationChangeConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: ExpenseDestinationChangeConfirmDialogProps) {
  const t = useTranslations('expenses.destination');
  const tCommon = useTranslations('common');

  function handleCancel() {
    onOpenChange(false);
  }

  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('confirmLeaveTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('confirmLeaveSingleProject')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="min-w-0 py-0 pb-4">
          <Alert tone="warning">{t('confirmLeaveSingleProject')}</Alert>
        </DialogBody>
        <FormDialogFooter
          cancelLabel={tCommon('actions.cancel')}
          onCancel={handleCancel}
          submitLabel={tCommon('actions.confirm')}
          onSubmit={handleConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
