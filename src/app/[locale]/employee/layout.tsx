import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { clientMessageNamespaces, pickClientMessages } from '@/shared/i18n/pick-client-messages';

export default async function EmployeeRootLayout({ children }: { children: React.ReactNode }) {
  const messages = pickClientMessages(
    await getMessages(),
    clientMessageNamespaces('common', 'errors', 'validation', 'employeeApp', 'workforce'),
  );

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="min-h-dvh bg-[var(--pf-bg)]">{children}</div>
    </NextIntlClientProvider>
  );
}
