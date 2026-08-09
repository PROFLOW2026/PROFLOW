'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';

/**
 * Photos/files attach on the record detail page after save (document_owner_type
 * daily_log / punch_list_item / inspection). Create forms stay text-first.
 */
export function FieldOpsPhotoLimitationNote() {
  const t = useTranslations('fieldOps.photoCapture');

  return (
    <Alert tone="info" title={t('title')}>
      {t('body')}
    </Alert>
  );
}
