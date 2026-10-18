import { getLocale, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
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
      <div className="flex flex-col gap-4 pb-6">
        <PageHeader title={t('portal.paymentsTitle')} />
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('portal.paymentsEmpty')}</p>
        ) : null}
        {rows.map((row) => (
          <Card key={row.agreementId}>
            <CardHeader>
              <CardTitle>{row.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                {t('portal.payable')}:{' '}
                <span dir="ltr" className="pf-numeric">
                  {formatMoneyString(row.status.totals.payableNet, row.status.currency, locale)}
                </span>
              </p>
              <p>
                {t('portal.paid')}:{' '}
                <span dir="ltr" className="pf-numeric">
                  {formatMoneyString(row.status.totals.paid, row.status.currency, locale)}
                </span>
              </p>
              <p>
                {t('portal.retention')}:{' '}
                <span dir="ltr" className="pf-numeric">
                  {formatMoneyString(row.status.retention.remaining, row.status.currency, locale)}
                </span>
              </p>
              {!row.status.eligibility.eligible && row.status.eligibility.holds.length > 0 ? (
                <p className="text-[var(--pf-text-secondary)]">
                  {t('portal.holds')}: {row.status.eligibility.holds.map((hold) => hold.kind).join(', ')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </WithPortalClientMessages>
  );
}
