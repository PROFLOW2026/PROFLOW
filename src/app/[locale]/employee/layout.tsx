import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { clientMessageNamespaces, pickClientMessages } from '@/shared/i18n/pick-client-messages';

/** Employee routes use the locale layout PWA manifest and bootstrap — one ProjectFlow install. */
export default async function EmployeeRootLayout({ children }: { children: React.ReactNode }) {
  const messages = pickClientMessages(
    await getMessages(),
    clientMessageNamespaces('common', 'errors', 'validation', 'employeeApp', 'workforce', 'offline'),
  );

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="bg-[var(--pf-bg)]">{children}</div>
    </NextIntlClientProvider>
  );
}
