'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { FormDialogFooter } from '@/components/patterns/form-dialog-footer';
import { Alert } from '@/components/ui/alert';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from '@/shared/i18n/navigation';

export interface DuplicateRecordWarningItem {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly reason: string;
}

export interface DuplicateRecordWarningDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly matches: readonly DuplicateRecordWarningItem[];
  readonly onBackToEdit: () => void;
  readonly onContinue: () => void;
}

export function DuplicateRecordWarningDialog({
  open,
  onOpenChange,
  title,
  description,
  matches,
  onBackToEdit,
  onContinue,
}: DuplicateRecordWarningDialogProps) {
  const t = useTranslations('common.duplicateWarning');

  function handleBack() {
    onBackToEdit();
    onOpenChange(false);
  }

  function handleContinue() {
    onOpenChange(false);
    onContinue();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="flex min-w-0 flex-col gap-3">
          <Alert tone="warning">{t('notBlocking')}</Alert>
          <ul className="flex min-w-0 flex-col gap-3 text-sm">
            {matches.map((match) => (
              <li key={match.id} className="rounded-md border border-border p-3">
                <p className="font-medium">{match.title}</p>
                <p className="mt-1 text-muted-foreground">{match.reason}</p>
                <Link href={match.href} className="mt-2 inline-block text-sm underline">
                  {t('openRecord')}
                </Link>
              </li>
            ))}
          </ul>
        </DialogBody>
        <FormDialogFooter
          cancelLabel={t('backToEdit')}
          onCancel={handleBack}
          submitLabel={t('continueAnyway')}
          onSubmit={handleContinue}
        />
      </DialogContent>
    </Dialog>
  );
}
