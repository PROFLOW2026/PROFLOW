'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
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
import type {
  BusinessChangeFieldDiff,
  BusinessChangeImpactLine,
} from '@/shared/business-change/types';

export interface BusinessChangeConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly changes: readonly BusinessChangeFieldDiff[];
  readonly impacts?: readonly BusinessChangeImpactLine[];
  readonly pending?: boolean;
  readonly onConfirm: () => void | Promise<void>;
  readonly onBackToEdit: () => void;
}

export function BusinessChangeConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  changes,
  impacts = [],
  pending = false,
  onConfirm,
  onBackToEdit,
}: BusinessChangeConfirmDialogProps) {
  const t = useTranslations('common.businessChange');

  function handleBack() {
    onBackToEdit();
    onOpenChange(false);
  }

  async function handleConfirm() {
    await onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="flex min-w-0 flex-col gap-4">
          <Alert tone="info">{t('historyNote')}</Alert>
          {changes.length > 0 ? (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-0 text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="py-2 pe-2 font-medium">{t('fieldColumn')}</th>
                    <th className="py-2 pe-2 font-medium">{t('beforeColumn')}</th>
                    <th className="py-2 font-medium">{t('afterColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((row) => (
                    <tr key={row.fieldLabel} className="border-b border-border/60">
                      <td className="py-2 pe-2 align-top font-medium">{row.fieldLabel}</td>
                      <td className="py-2 pe-2 align-top break-words">{row.before}</td>
                      <td className="py-2 align-top break-words">{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {impacts.length > 0 ? (
            <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
              {impacts.map((line) => (
                <li key={line.label}>
                  <span className="font-medium text-foreground">{line.label}: </span>
                  {line.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </DialogBody>
        <FormDialogFooter
          cancelLabel={t('backToEdit')}
          onCancel={handleBack}
          cancelDisabled={pending}
          submitLabel={pending ? t('confirmPending') : t('confirmSave')}
          onSubmit={() => void handleConfirm()}
          submitLoading={pending}
        />
      </DialogContent>
    </Dialog>
  );
}
