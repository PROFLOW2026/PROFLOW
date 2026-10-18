'use client';

import { useTranslations } from 'next-intl';
import {
  confirmVendorLogoUploadAction,
  prepareVendorLogoUploadAction,
  removeVendorLogoAction,
} from '@/app/[locale]/(app)/vendors/[vendorId]/vendor-logo-actions';
import { IdentityImageControl } from './identity-image-control';

export function VendorLogoPanel({
  vendorId,
  vendorName,
  previewUrl,
  canEdit,
  schemaReady,
  storageConfigured,
}: {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly previewUrl: string | null;
  readonly canEdit: boolean;
  readonly schemaReady: boolean;
  readonly storageConfigured: boolean;
}) {
  const t = useTranslations('vendors.logo');

  return (
    <IdentityImageControl
      copy={{
        label: t('label'),
        hint: t('hint'),
        upload: t('upload'),
        replace: t('replace'),
        remove: t('remove'),
        invalidType: t('invalidType'),
        tooLarge: t('tooLarge'),
        uploadFailed: t('uploadFailed'),
        schemaPending: t('schemaPending'),
        storageNotConfigured: t('storageNotConfigured'),
      }}
      previewUrl={previewUrl}
      displayName={vendorName}
      canEdit={canEdit}
      schemaReady={schemaReady}
      storageConfigured={storageConfigured}
      prepareAction={(input) => prepareVendorLogoUploadAction({ vendorId, ...input })}
      confirmAction={(input) => confirmVendorLogoUploadAction({ vendorId, ...input })}
      removeAction={() => removeVendorLogoAction({ vendorId })}
    />
  );
}
