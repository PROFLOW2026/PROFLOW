'use client';

import { useTranslations } from 'next-intl';
import { inviteVendorToTenderAction } from '@/app/[locale]/(app)/projects/[projectId]/tenders/actions';
import { ActionForm, FormField } from '@/modules/subcontracts/ui/action-form';

export function TenderInviteForm({
  projectId,
  packageId,
  vendors,
}: {
  readonly projectId: string;
  readonly packageId: string;
  readonly vendors: readonly { readonly id: string; readonly name: string }[];
}) {
  const t = useTranslations('awards');
  return (
    <ActionForm
      action={inviteVendorToTenderAction}
      hidden={{ projectId, packageId }}
      submitLabel={t('forms.inviteVendor')}
      successLabel={t('forms.vendorInvited')}
    >
      <FormField
        label={t('forms.vendor')}
        name="vendorId"
        required
        options={vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))}
      />
    </ActionForm>
  );
}
