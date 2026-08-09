import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('common');

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--pf-bg-page)] px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--pf-action-primary)] text-sm font-bold text-[var(--pf-action-primary-fg)]">
          PF
        </span>
        <span className="text-lg font-semibold">{t('appName')}</span>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-6 shadow-[var(--pf-shadow-sm)]">
        {children}
      </div>
    </div>
  );
}
