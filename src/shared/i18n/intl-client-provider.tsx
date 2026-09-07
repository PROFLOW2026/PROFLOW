'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { pfGetMessageFallback } from '@/shared/i18n/message-fallback';

/**
 * Client boundary for next-intl. `getMessageFallback` must be wired here — passing
 * a function from the server layout into `NextIntlClientProvider` crashes RSC.
 */
export function IntlClientProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="Asia/Jerusalem"
      getMessageFallback={pfGetMessageFallback}
    >
      {children}
    </NextIntlClientProvider>
  );
}
