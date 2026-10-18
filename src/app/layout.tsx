import { cookies } from 'next/headers';
import { Noto_Sans, Noto_Sans_Arabic, Noto_Sans_Hebrew } from 'next/font/google';
import type { ReactNode } from 'react';
import { getRequestPathname } from '@/shared/http/request-pathname';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { documentLocale } from '@/shared/i18n/bare-path';
import { LOCALE_METADATA } from '@/shared/i18n/config';
import { cn } from '@/shared/ui/cn';
import './globals.css';

/* Body 400 + heading 600 only — fewer next/font files at build on the 8 GB builder. */
const notoSans = Noto_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-noto-sans',
});

const notoHebrew = Noto_Sans_Hebrew({
  subsets: ['hebrew'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-noto-hebrew',
});

const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-noto-arabic',
});

/**
 * Next.js requires `<html>` and `<body>` here. `lang`/`dir` follow the URL
 * locale when the path includes one (`/en` stays LTR even if the cookie is
 * Hebrew). The locale cookie is the fallback for bare paths. Client navigation
 * stays in sync via `LocaleDocumentAttributes` inside `[locale]/layout.tsx`.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const pathname = await getRequestPathname();
  const locale = documentLocale(pathname, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const metadata = LOCALE_METADATA[locale];

  return (
    <html
      lang={metadata.htmlLang}
      dir={metadata.dir}
      className={cn(notoSans.variable, notoHebrew.variable, notoArabic.variable)}
      suppressHydrationWarning
    >
      <body
        className="min-h-dvh min-w-0 max-w-full bg-page text-content antialiased"
        dir={metadata.dir}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
