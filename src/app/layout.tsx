import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { localeFromCookieValue } from '@/shared/i18n/bare-path';
import { LOCALE_METADATA } from '@/shared/i18n/config';
import './globals.css';

/**
 * Next.js requires `<html>` and `<body>` here. Locale-specific `lang`/`dir`
 * are seeded from the locale cookie and kept in sync client-side via
 * `LocaleDocumentAttributes` inside `[locale]/layout.tsx`.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const locale = localeFromCookieValue(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const metadata = LOCALE_METADATA[locale];

  return (
    <html lang={metadata.htmlLang} dir={metadata.dir} suppressHydrationWarning>
      <body
        className="min-h-dvh bg-page text-content antialiased"
        dir={metadata.dir}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
