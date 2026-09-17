'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function EmployeePwaInstallManualSheet({ open, onOpenChange }: Props) {
  const t = useTranslations('employeeApp.install');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('manualDismiss')} mobileSheet className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('manualTitle')}</DialogTitle>
        </DialogHeader>
        <ol className="list-none space-y-3 text-sm text-[var(--pf-text-primary)]">
          <li className="flex items-start gap-3">
            <Download className="mt-0.5 size-5 shrink-0 text-[var(--pf-accent)]" aria-hidden />
            <span>{t('manualStepMenu')}</span>
          </li>
          <li className="flex items-start gap-3 ps-8">{t('manualStepInstall')}</li>
        </ol>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('manualHint')}</p>
        <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
          {t('manualDismiss')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
