import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PwaBootstrap } from '@/modules/offline/ui/pwa-bootstrap';
import { pickClientMessages } from '@/shared/i18n/pick-client-messages';
import { LocaleDocumentAttributes } from '@/shared/i18n/locale-document-attributes';
import { routing } from '@/shared/i18n/routing';

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

  // Server Components still see full catalogs via getRequestConfig.
  // Client flights only carry the lean app set (~80KB vs ~237KB).
  const clientMessages = pickClientMessages(await getMessages());

  return (
    <NextIntlClientProvider messages={clientMessages}>
      <LocaleDocumentAttributes />
      <PwaBootstrap />
      <TooltipProvider delayDuration={200}>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </NextIntlClientProvider>
  );
}
