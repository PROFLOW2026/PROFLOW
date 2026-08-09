import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import { routing } from '@/shared/i18n/routing';
import '../globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The mobile surface is a first-class product, not a zoomed page (doc 62).
  viewportFit: 'cover',
  themeColor: '#0f766e',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return {
    title: { default: t('appName'), template: `%s · ${t('appName')}` },
    description: t('appName'),
    applicationName: t('appName'),
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: t('appName'),
      statusBarStyle: 'default',
    },
    icons: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required for static rendering of locale segments.
  setRequestLocale(locale);

  const metadata = LOCALE_METADATA[locale as Locale];

  return (
    <html lang={metadata.htmlLang} dir={metadata.dir} suppressHydrationWarning>
      <body className="min-h-dvh bg-page text-content antialiased" dir={metadata.dir}>
        <NextIntlClientProvider>
          <TooltipProvider delayDuration={200}>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
