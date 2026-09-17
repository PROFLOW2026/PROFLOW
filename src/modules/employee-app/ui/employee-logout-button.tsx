'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { employeeSignOutAction } from '@/app/[locale]/employee/actions';
import { cn } from '@/shared/ui/cn';

export function EmployeeLogoutButton({ className }: { readonly className?: string }) {
  const t = useTranslations('employeeApp');
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          void employeeSignOutAction();
        });
      }}
      className={cn(
        'min-h-11 w-full rounded-lg border border-[var(--pf-border)] px-4 py-2 text-sm font-medium',
        'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-surface)] active:bg-[var(--pf-bg-surface)]',
        'disabled:opacity-60',
        className,
      )}
    >
      {t('signOut')}
    </button>
  );
}
