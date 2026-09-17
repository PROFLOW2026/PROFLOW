'use client';

import { Download, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useOptionalToast } from '@/components/ui/toast';
import { usePwaInstall } from '@/modules/offline/ui/use-pwa-install';
import { cn } from '@/shared/ui/cn';
import { EmployeePwaInstallIosSheet } from './employee-pwa-install-ios-sheet';

type Variant = 'card' | 'header';

export function EmployeePwaInstall({ variant = 'card' }: { variant?: Variant }) {
  const t = useTranslations('employeeApp.install');
  const toast = useOptionalToast();
  const { capability, installing, promptInstall } = usePwaInstall();
  const [iosOpen, setIosOpen] = useState(false);

  if (capability === 'installed' || capability === 'unavailable') {
    return null;
  }

  async function handleInstallClick(): Promise<void> {
    if (capability === 'manual_ios') {
      setIosOpen(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      toast?.push(t('success'), 'success');
    }
  }

  const trigger =
    variant === 'header' ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 shrink-0 px-2"
        loading={installing}
        aria-label={t('cta')}
        onClick={() => void handleInstallClick()}
      >
        <Smartphone className="size-5" aria-hidden />
      </Button>
    ) : (
      <Button
        type="button"
        className="w-full sm:w-auto"
        loading={installing}
        onClick={() => void handleInstallClick()}
      >
        <Download className="size-4 shrink-0" aria-hidden />
        {installing ? t('installing') : t('cta')}
      </Button>
    );

  return (
    <>
      {variant === 'card' ? (
        <Card className="space-y-3 border border-[var(--pf-border)] p-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t('title')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
          </div>
          {trigger}
        </Card>
      ) : (
        trigger
      )}
      <EmployeePwaInstallIosSheet open={iosOpen} onOpenChange={setIosOpen} />
    </>
  );
}

/** Compact header affordance — same install flow as the home card. */
export function EmployeePwaInstallHeaderAction({ className }: { className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center', className)}>
      <EmployeePwaInstall variant="header" />
    </div>
  );
}
