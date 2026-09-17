'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import {
  readApiErrorMessage,
  translateClientMessageKey,
  type ClientMessageTranslators,
} from '@/shared/i18n/translate-client-message-key';

export function useTranslateStorageApiError() {
  const tErrors = useTranslations('errors');
  const tExternalStorage = useTranslations('externalStorage');

  const translators = useMemo(
    (): ClientMessageTranslators => ({
      tErrors: (key) => tErrors(key as 'unexpected'),
      namespaces: {
        externalStorage: (key) => tExternalStorage(key as 'errors.operationFailed'),
      },
    }),
    [tErrors, tExternalStorage],
  );

  const translate = useCallback(
    (messageKey: string | null | undefined, fallback: string) =>
      translateClientMessageKey(messageKey, translators, fallback),
    [translators],
  );

  const fromResponse = useCallback(
    (response: Response, fallback: string) => readApiErrorMessage(response, translators, fallback),
    [translators],
  );

  return { translate, fromResponse };
}
