'use client';

import { useTranslations } from 'next-intl';
import {
  awardTenderAction,
  closeTenderBiddingAction,
} from '@/app/[locale]/(app)/projects/[projectId]/tenders/actions';
import { ActionForm, FieldGrid, FormField } from '@/modules/subcontracts/ui/action-form';
import { tenderOfferVendorLabel } from '../domain/tender-offer-display';

type OfferRow = {
  readonly id: string;
  readonly vendorId: string;
  readonly status: string;
};

export function TenderCloseBiddingForm({
  projectId,
  packageId,
}: {
  readonly projectId: string;
  readonly packageId: string;
}) {
  const t = useTranslations('awards');
  return (
    <ActionForm
      action={closeTenderBiddingAction}
      hidden={{ projectId, packageId }}
      submitLabel={t('forms.closeBidding')}
      successLabel={t('forms.biddingClosed')}
      submitVariant="secondary"
    />
  );
}

export function TenderAwardForm({
  projectId,
  packageId,
  offers,
  vendorNames,
}: {
  readonly projectId: string;
  readonly packageId: string;
  readonly offers: readonly OfferRow[];
  readonly vendorNames: ReadonlyMap<string, string>;
}) {
  const t = useTranslations('awards');
  const selectable = offers.filter((offer) => offer.status === 'submitted');
  if (selectable.length === 0) {
    return <p className="text-sm text-[var(--pf-text-muted)]">{t('forms.noAwardableOffers')}</p>;
  }
  return (
    <ActionForm
      action={awardTenderAction}
      hidden={{ projectId, packageId }}
      submitLabel={t('forms.awardTender')}
      successLabel={t('forms.tenderAwarded')}
    >
      <FormField
        label={t('forms.winningOffer')}
        name="offerId"
        required
        options={selectable.map((offer) => ({
          value: offer.id,
          label: tenderOfferVendorLabel(vendorNames, offer.vendorId),
        }))}
      />
      <FieldGrid>
        <FormField label={t('forms.agreementTitle')} name="title" />
        <FormField label={t('forms.subcontractNumber')} name="subcontractNumber" />
      </FieldGrid>
    </ActionForm>
  );
}
