import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getTenderPackageDetail } from '@/modules/contractor-procurement';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function TenderPackageScreen({ surfaceRoot: _surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; packageId: string }>;
}) {
  const { projectId, packageId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('awards');
  const detail = await withOrgContext((context) => getTenderPackageDetail(context, { projectId, packageId }));

  return (
    <WithClientMessages extra={['awards']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={detail.pkg.title} description={detail.pkg.scopeDescription ?? t('detail.scopeEmpty')} />
        <section className="rounded-md border border-[var(--pf-border)] p-4 text-sm">
          <h2 className="mb-2 font-medium">{t('detail.offers')}</h2>
          {detail.offers.length === 0 ? (
            <p className="text-[var(--pf-text-muted)]">{t('detail.noOffers')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.offers.map((offer) => {
                const money = detail.financials.find((f) => f.offerId === offer.id);
                return (
                  <li key={offer.id} className="flex justify-between gap-2">
                    <span>{t('detail.vendorOffer', { vendor: offer.vendorId.slice(0, 8) })}</span>
                    <span>
                      {money ? `${money.bidAmount} ${money.currency}` : t('detail.amountHidden')}
                      {' · '}
                      {t(`offerStatus.${offer.status}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </WithClientMessages>
  );
}

export default function TenderPackagePage(
  props: Omit<Parameters<typeof TenderPackageScreen>[0], 'surfaceRoot'>,
) {
  return <TenderPackageScreen {...props} />;
}
