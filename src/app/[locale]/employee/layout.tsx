import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { PwaBootstrap } from '@/modules/offline/ui/pwa-bootstrap';
import { clientMessageNamespaces, pickClientMessages } from '@/shared/i18n/pick-client-messages';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'employeeApp' });

  return {
    applicationName: t('pwa.shortName'),
    manifest: '/employee.webmanifest',
    appleWebApp: {
      capable: true,
      title: t('pwa.name'),
      statusBarStyle: 'default',
    },
    icons: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}

export default async function EmployeeRootLayout({ children }: { children: React.ReactNode }) {
  const messages = pickClientMessages(
    await getMessages(),
    clientMessageNamespaces('common', 'errors', 'validation', 'employeeApp', 'workforce', 'offline'),
  );

  return (
    <NextIntlClientProvider messages={messages}>
      <PwaBootstrap />
      <div className="min-h-dvh bg-[var(--pf-bg)]">{children}</div>
    </NextIntlClientProvider>
  );
}
