import { getTranslations } from 'next-intl/server';
import { DashboardCompanyDocumentsLink } from './dashboard-company-documents-link';

/**
 * Top-of-dashboard quick access — always near the greeting on mobile and desktop.
 * Persona-specific dashboard cards must not be the only place for company files.
 */
export async function DashboardQuickAccessBar() {
  const t = await getTranslations('dashboard');

  return (
    <section
      className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
      aria-label={t('quickActions')}
      data-pf-dashboard-quick-access=""
    >
      <DashboardCompanyDocumentsLink />
    </section>
  );
}
