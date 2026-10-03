import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LegalFooterLinks } from '@/modules/legal/ui/legal-footer-links';
import { LocaleSwitcherInline } from '@/shared/i18n/locale-switcher-inline';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Contractor auth pages: no organization, no org shell. */
export default async function ContractorAuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('contractorAccess.auth');

  return (
    <WithClientMessages extra={['auth', 'contractorAccess', 'validation']}>
      <div className="flex min-h-dvh min-w-0 max-w-full flex-col items-center justify-center bg-[var(--pf-bg-page)] px-4 py-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:py-10">
        <div className="mb-6 flex min-w-0 max-w-full items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--pf-action-primary)] text-sm font-bold text-[var(--pf-action-primary-fg)]">
            PF
          </span>
          <span className="min-w-0 truncate text-lg font-semibold">{t('brand')}</span>
        </div>

        <LocaleSwitcherInline className="mb-4" />

        <div className="w-full min-w-0 max-w-sm rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-sm)] sm:p-6">
          {children}
        </div>

        <LegalFooterLinks className="mt-6 text-center text-xs text-[var(--pf-text-muted)] [&_a]:text-[var(--pf-text-muted)] [&_a:hover]:text-[var(--pf-text-brand)]" />
      </div>
    </WithClientMessages>
  );
}
