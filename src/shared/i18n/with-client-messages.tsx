import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { MessageNamespace } from '@/shared/i18n/config';
import {
  clientMessageNamespaces,
  pickClientMessages,
} from '@/shared/i18n/pick-client-messages';

/**
 * Nested client-message scope for route trees that need namespaces beyond
 * the lean root `APP_CLIENT_MESSAGE_NAMESPACES` set.
 */
export async function WithClientMessages({
  extra = [],
  children,
}: {
  extra?: readonly MessageNamespace[];
  children: ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={pickClientMessages(messages, clientMessageNamespaces(...extra))}
    >
      {children}
    </NextIntlClientProvider>
  );
}
