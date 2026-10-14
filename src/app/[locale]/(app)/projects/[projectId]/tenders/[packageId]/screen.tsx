import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { tenderOfferVendorLabel } from '@/modules/contractor-procurement/domain/tender-offer-display';
import { getTenderPackageDetail } from '@/modules/contractor-procurement';
import {
  TenderAwardForm,
  TenderCloseBiddingForm,
} from '@/modules/contractor-procurement/ui/tender-award-panel';
import { TenderInviteForm } from '@/modules/contractor-procurement/ui/tender-invite-form';
import { getCreateAgreementOptions } from '@/modules/subcontracts';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export async function TenderPackageScreen({ surfaceRoot: _surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; packageId: string }>;
}) {
  const { projectId, packageId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('awards');
  const { detail, vendorOptions } = await withOrgContext(async (context) => {
    const loaded = await getTenderPackageDetail(context, { projectId, packageId });
    const openForInvite =
      loaded.canManage && loaded.pkg.status !== 'awarded' && loaded.pkg.status !== 'cancelled';
    const vendors = openForInvite
      ? ((await getCreateAgreementOptions(context, projectId).catch(() => null))?.vendors ?? [])
      : [];
    return { detail: loaded, vendorOptions: vendors };
  });

  const canInvite =
    detail.canManage && detail.pkg.status !== 'awarded' && detail.pkg.status !== 'cancelled';
  const canCloseBidding = detail.canManage && detail.pkg.status === 'inviting';
  const canAward =
    detail.canManage &&
    (detail.pkg.status === 'inviting' || detail.pkg.status === 'evaluating');

  return (
    <WithAppClientMessages extra={['awards']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={detail.pkg.title} description={detail.pkg.scopeDescription ?? t('detail.scopeEmpty')} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge label={t(`status.${detail.pkg.status}`)} shape="pending" />
          <span className="text-[var(--pf-text-muted)]">
            {t('fields.trade')}: {detail.pkg.tradeKey}
          </span>
        </div>
        {canInvite && vendorOptions.length > 0 ? (
          <section className="rounded-md border border-[var(--pf-border)] p-4">
            <h2 className="mb-3 text-sm font-medium">{t('forms.inviteSection')}</h2>
            <TenderInviteForm projectId={projectId} packageId={packageId} vendors={vendorOptions} />
          </section>
        ) : null}
        {canCloseBidding ? (
          <section className="rounded-md border border-[var(--pf-border)] p-4">
            <h2 className="mb-3 text-sm font-medium">{t('forms.evaluationSection')}</h2>
            <p className="mb-3 text-sm text-[var(--pf-text-muted)]">{t('forms.closeBiddingHint')}</p>
            <TenderCloseBiddingForm projectId={projectId} packageId={packageId} />
          </section>
        ) : null}
        {canAward ? (
          <section className="rounded-md border border-[var(--pf-border)] p-4">
            <h2 className="mb-3 text-sm font-medium">{t('forms.awardSection')}</h2>
            <TenderAwardForm
              projectId={projectId}
              packageId={packageId}
              offers={detail.offers}
              vendorNames={detail.vendorNames}
            />
          </section>
        ) : null}
        <section className="rounded-md border border-[var(--pf-border)] p-4 text-sm">
          <h2 className="mb-2 font-medium">{t('detail.offers')}</h2>
          {detail.offers.length === 0 ? (
            <p className="text-[var(--pf-text-muted)]">{t('detail.noOffers')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.offers.map((offer) => {
                const money = detail.financials.find((f) => f.offerId === offer.id);
                const vendorLabel = tenderOfferVendorLabel(
                  detail.vendorNames,
                  offer.vendorId,
                  t('detail.vendorUnknown'),
                );
                return (
                  <li key={offer.id} className="flex justify-between gap-2">
                    <span>{t('detail.vendorOffer', { vendor: vendorLabel })}</span>
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
    </WithAppClientMessages>
  );
}

export default function TenderPackagePage(
  props: Omit<Parameters<typeof TenderPackageScreen>[0], 'surfaceRoot'>,
) {
  return <TenderPackageScreen {...props} />;
}
