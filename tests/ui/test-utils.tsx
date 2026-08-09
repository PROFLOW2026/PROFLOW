import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import en from '@/locales/en/common.json';
import enFinancial from '@/locales/en/financial.json';
import he from '@/locales/he-IL/common.json';
import heFinancial from '@/locales/he-IL/financial.json';

const MESSAGES = {
  en: { common: en, financial: enFinancial },
  'he-IL': { common: he, financial: heFinancial },
} as const;

export type TestLocale = keyof typeof MESSAGES;

export function renderWithIntl(
  ui: ReactElement,
  { locale = 'he-IL' as TestLocale, ...options }: RenderOptions & { locale?: TestLocale } = {},
): RenderResult {
  const dir = locale === 'he-IL' ? 'rtl' : 'ltr';

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <div dir={dir} lang={locale === 'he-IL' ? 'he' : 'en'}>
        <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Jerusalem">
          {children}
        </NextIntlClientProvider>
      </div>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
