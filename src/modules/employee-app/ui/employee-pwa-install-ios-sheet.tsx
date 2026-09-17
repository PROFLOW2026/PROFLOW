'use client';

import { Share } from 'lucide-react';
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

export function EmployeePwaInstallIosSheet({ open, onOpenChange }: Props) {
  const t = useTranslations('employeeApp.install');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('iosDismiss')} mobileSheet className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('iosTitle')}</DialogTitle>
        </DialogHeader>
        <ol className="list-none space-y-3 text-sm text-[var(--pf-text-primary)]">
          <li className="flex items-start gap-3">
            <Share className="mt-0.5 size-5 shrink-0 text-[var(--pf-accent)]" aria-hidden />
            <span>{t('iosStepShare')}</span>
          </li>
          <li className="flex items-start gap-3 ps-8">{t('iosStepAdd')}</li>
          <li className="flex items-start gap-3 ps-8">{t('iosStepConfirm')}</li>
        </ol>
        <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
          {t('iosDismiss')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
