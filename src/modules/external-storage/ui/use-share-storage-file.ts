'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  canShareFilesViaWebShare,
  downloadStorageFile,
  shareStorageFile,
  type ShareStorageFileInput,
} from '../client/share-storage-file';

export function useShareStorageFile() {
  const t = useTranslations('externalStorage.preview');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const shareFile = useCallback(
    async (input: ShareStorageFileInput) => {
      setSharing(true);
      setShareError(null);
      try {
        const result = await shareStorageFile(input);
        if (result.ok) return result;

        if (result.reason === 'aborted') return result;

        if (result.reason === 'unsupported') {
          setShareError(t('shareUnsupported'));
          try {
            await downloadStorageFile(input);
            return { ok: true as const, method: 'download_fallback' as const };
          } catch {
            setShareError(t('shareFailed'));
            return result;
          }
        }

        setShareError(t('shareFailed'));
        return result;
      } catch {
        setShareError(t('shareFailed'));
        return { ok: false as const, reason: 'failed' as const };
      } finally {
        setSharing(false);
      }
    },
    [t],
  );

  return {
    sharing,
    shareError,
    setShareError,
    shareFile,
    canNativeShare: canShareFilesViaWebShare(),
  };
}
