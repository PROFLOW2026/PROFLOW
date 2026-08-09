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
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Jerusalem">
        {children}
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
