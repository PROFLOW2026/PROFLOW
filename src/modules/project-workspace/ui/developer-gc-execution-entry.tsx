import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';

/** Single entry from the commercial project page into the Developer/GC execution workspace. */
export async function DeveloperGcExecutionEntry({ href }: { readonly href: string }) {
  const t = await getTranslations('projectWorkspace');
  return (
    <section
      aria-labelledby="developer-gc-execution-entry"
      className="min-w-0 max-w-full rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-4 sm:p-5"
    >
      <h2 id="developer-gc-execution-entry" className="text-base font-semibold text-[var(--pf-text-primary)]">
        {t('execution.identityTitle')}
      </h2>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('execution.entryHint')}</p>
      <Link
        href={href}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--pf-action-primary)] px-4 text-sm font-semibold text-[var(--pf-action-primary-fg)] hover:opacity-95 sm:w-auto"
      >
        {t('execution.enterWorkspace')}
        <ChevronLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </Link>
    </section>
  );
}
