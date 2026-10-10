'use client';

import { useTranslations } from 'next-intl';
import { ActionForm, FieldGrid, FormField } from '@/modules/subcontracts/ui/action-form';
import { submitContractorBidAction } from '@/app/[locale]/contractor/(portal)/projects/[projectId]/tenders/actions';

export function ContractorBidForm({
  organizationId,
  projectId,
  packageId,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly packageId: string;
}) {
  const t = useTranslations('awards');
  return (
    <ActionForm
      action={submitContractorBidAction}
      hidden={{ organizationId, projectId, packageId }}
      submitLabel={t('portal.submitBid')}
      successLabel={t('portal.bidSubmitted')}
      resetOnSuccess
    >
      <FieldGrid>
        <FormField label={t('portal.bidAmount')} name="bidAmount" type="number" required inputMode="decimal" />
        <FormField label={t('portal.leadTimeDays')} name="leadTimeDays" type="number" inputMode="numeric" />
      </FieldGrid>
      <FormField label={t('portal.bidNotes')} name="notes" multiline />
    </ActionForm>
  );
}
