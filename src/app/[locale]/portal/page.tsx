import { getTranslations } from 'next-intl/server';
import {
  EXTERNAL_PUBLIC_ACCESS_LIMITATION,
  getExternalPublicAccessStatus,
} from '@/modules/portal';

/**
 * Public portal entry — intentionally DISABLED.
 * Does not authenticate ExternalPrincipals; does not expose the internal app.
 */
export default async function PublicPortalDisabledPage() {
  const t = await getTranslations('portal');
  const access = getExternalPublicAccessStatus();

  return (
    <main className="flex min-h-dvh min-w-0 items-center justify-center bg-[var(--pf-bg-page)] px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-6 shadow-[var(--pf-shadow-sm)]">
        <h1 className="text-lg font-semibold">{t('publicDisabled.title')}</h1>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
          {t('publicDisabled.body')}
        </p>
        <p className="mt-3 text-xs text-[var(--pf-text-muted)]" data-status={access.status}>
          {EXTERNAL_PUBLIC_ACCESS_LIMITATION}
        </p>
      </div>
    </main>
  );
}
