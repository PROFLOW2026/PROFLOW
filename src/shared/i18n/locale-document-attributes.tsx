'use client';

import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { isLocale, LOCALE_METADATA } from '@/shared/i18n/config';

/** Keeps `<html lang>` and `dir` aligned with the active locale after navigation. */
export function LocaleDocumentAttributes() {
  const locale = useLocale();

  useEffect(() => {
    const meta = isLocale(locale) ? LOCALE_METADATA[locale] : LOCALE_METADATA['he-IL'];
    document.documentElement.lang = meta.htmlLang;
    document.documentElement.dir = meta.dir;
    document.body.dir = meta.dir;
  }, [locale]);

  return null;
}
