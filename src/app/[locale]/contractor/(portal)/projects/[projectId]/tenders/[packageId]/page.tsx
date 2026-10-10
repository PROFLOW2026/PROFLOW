import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { getPortalTenderDetail } from '@/modules/contractor-procurement';
import { ContractorBidForm } from '@/modules/contractor-procurement/ui/contractor-bid-form';
import { resolveContractorProjectOrganization } from '@/modules/defects';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { Link } from '@/shared/i18n/navigation';
import { bidiIsolate, formatMoneyString } from '@/shared/money';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorTenderDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; packageId: string }>;
}) {
  const { projectId, packageId } = await params;
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorProjectOrganization(context, projectId));
  const detail = await loadOrNotFound(() =>
    getPortalTenderDetail(context, { organizationId, projectId, packageId }),
  );
  const [t, locale] = await Promise.all([getTranslations('awards'), getLocale()]);
  const listHref = `/contractor/projects/${projectId}/tenders`;
  const { pkg, vendorOffer, financials, canSubmit } = detail;

  return (
    <WithPortalClientMessages extra={['awards', 'subcontracts']}>
      <div className="flex flex-col gap-4 pb-6">
        <PageHeader
          title={pkg.title}
          description={
            pkg.tradeKey ? `${t('fields.trade')}: ${t('portal.tradeLine', { trade: pkg.tradeKey })}` : undefined
          }
          breadcrumb={
            <Link href={listHref} className="text-sm text-[var(--pf-text-brand)] hover:underline">
              {t('portal.back')}
            </Link>
          }
          meta={<Badge tone="neutral">{t(`status.${pkg.status}`)}</Badge>}
        />

        <Card>
          <CardHeader>
            <CardTitle>{t('portal.scopeTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="whitespace-pre-wrap">{pkg.scopeDescription?.trim() || t('detail.scopeEmpty')}</p>
          </CardContent>
        </Card>

        {vendorOffer && financials ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('portal.yourBid')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Badge tone={vendorOffer.status === 'submitted' ? 'success' : 'neutral'}>
                {t(`offerStatus.${vendorOffer.status}`)}
              </Badge>
              <p className="font-semibold">
                {bidiIsolate(formatMoneyString(financials.bidAmount, financials.currency, locale))}
              </p>
              {vendorOffer.notes ? <p className="text-[var(--pf-text-secondary)]">{vendorOffer.notes}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {canSubmit ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('portal.submitBidTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ContractorBidForm organizationId={organizationId} projectId={projectId} packageId={packageId} />
            </CardContent>
          </Card>
        ) : null}

        {pkg.status === 'awarded' ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('portal.packageClosed')}</p>
        ) : null}
      </div>
    </WithPortalClientMessages>
  );
}
