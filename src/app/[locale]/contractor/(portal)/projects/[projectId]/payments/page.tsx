import { getLocale, getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  portalMetricCellClass,
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageTitleClass,
  portalPanelClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { listContractorProjectPayments, resolveContractorPaymentsOrganization } from '@/modules/subcontract-claims';
import { loadOrNotFound } from '@/modules/subcontract-claims/ui/page-guard';
import { formatMoneyString } from '@/shared/money';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorPaymentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations('subcontractClaims');
  const locale = await getLocale();
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorPaymentsOrganization(context, projectId));
  const rows = await loadOrNotFound(() => listContractorProjectPayments(context, organizationId, projectId));

  return (
    <WithPortalClientMessages extra={['subcontractClaims']}>
      <div className={portalPageStackClass}>
        <header className={portalPageHeaderClass}>
          <h1 className={portalPageTitleClass}>{t('portal.paymentsTitle')}</h1>
        </header>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)]/40 px-4 py-6 text-sm text-[var(--pf-text-secondary)]">
            {t('portal.paymentsEmpty')}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4">
          {rows.map((row) => (
            <section key={row.agreementId} className={portalPanelClass}>
              <h2 className="mb-3 text-base font-semibold tracking-tight text-[var(--pf-text-primary)]">{row.title}</h2>
              <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className={portalMetricCellClass}>
                  <dt className="text-xs text-[var(--pf-text-secondary)]">{t('portal.payable')}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums" dir="ltr">
                    {formatMoneyString(row.status.totals.payableNet, row.status.currency, locale)}
                  </dd>
                </div>
                <div className={portalMetricCellClass}>
                  <dt className="text-xs text-[var(--pf-text-secondary)]">{t('portal.paid')}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums" dir="ltr">
                    {formatMoneyString(row.status.totals.paid, row.status.currency, locale)}
                  </dd>
                </div>
                <div className={portalMetricCellClass}>
                  <dt className="text-xs text-[var(--pf-text-secondary)]">{t('portal.retention')}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums" dir="ltr">
                    {formatMoneyString(row.status.retention.remaining, row.status.currency, locale)}
                  </dd>
                </div>
              </dl>
              {!row.status.eligibility.eligible && row.status.eligibility.holds.length > 0 ? (
                <p className="mt-3 text-sm text-[var(--pf-text-secondary)]">
                  {t('portal.holds')}: {row.status.eligibility.holds.map((hold) => hold.kind).join(', ')}
                </p>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </WithPortalClientMessages>
  );
}
