'use client';

import { useTranslations } from 'next-intl';
import {
  confirmContractorAvatarUploadAction,
  prepareContractorAvatarUploadAction,
  removeContractorAvatarAction,
} from '@/app/[locale]/contractor/(portal)/account/contractor-avatar-actions';
import { IdentityImageControl } from './identity-image-control';

export function ContractorAvatarPanel({
  displayName,
  previewUrl,
  schemaReady,
  storageConfigured,
}: {
  readonly displayName: string;
  readonly previewUrl: string | null;
  readonly schemaReady: boolean;
  readonly storageConfigured: boolean;
}) {
  const t = useTranslations('contractorAccess.account.avatar');

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
      displayName={displayName}
      canEdit
      schemaReady={schemaReady}
      storageConfigured={storageConfigured}
      prepareAction={prepareContractorAvatarUploadAction}
      confirmAction={confirmContractorAvatarUploadAction}
      removeAction={removeContractorAvatarAction}
    />
  );
}
