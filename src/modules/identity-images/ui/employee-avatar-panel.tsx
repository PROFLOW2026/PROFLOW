'use client';

import { useTranslations } from 'next-intl';
import {
  confirmEmployeeAvatarUploadAction,
  prepareEmployeeAvatarUploadAction,
  removeEmployeeAvatarAction,
} from '@/app/[locale]/(app)/workforce/employees/[employeeId]/employee-avatar-actions';
import { IdentityImageControl } from './identity-image-control';

export function EmployeeAvatarPanel({
  employeeId,
  employeeName,
  previewUrl,
  canEdit,
  schemaReady,
  storageConfigured,
}: {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly previewUrl: string | null;
  readonly canEdit: boolean;
  readonly schemaReady: boolean;
  readonly storageConfigured: boolean;
}) {
  const t = useTranslations('workforce.employees.avatar');

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
      displayName={employeeName}
      canEdit={canEdit}
      schemaReady={schemaReady}
      storageConfigured={storageConfigured}
      prepareAction={(input) => prepareEmployeeAvatarUploadAction({ employeeId, ...input })}
      confirmAction={(input) => confirmEmployeeAvatarUploadAction({ employeeId, ...input })}
      removeAction={() => removeEmployeeAvatarAction({ employeeId })}
    />
  );
}
