'use client';

import { useTranslations } from 'next-intl';
import { createTenderPackageAction } from '@/app/[locale]/(app)/projects/[projectId]/tenders/actions';
import { ActionForm, FieldGrid, FormField } from '@/modules/subcontracts/ui/action-form';

export function TenderPackageForm({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('awards');
  return (
    <ActionForm
      action={createTenderPackageAction}
      hidden={{ projectId }}
      submitLabel={t('forms.createPackage')}
      successLabel={t('forms.packageCreated')}
      resetOnSuccess
    >
      <FieldGrid>
        <FormField label={t('forms.title')} name="title" required />
        <FormField label={t('fields.trade')} name="tradeKey" required />
      </FieldGrid>
      <FormField label={t('forms.scopeDescription')} name="scopeDescription" multiline />
    </ActionForm>
  );
}
