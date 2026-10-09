import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  CONTRACTOR_PORTAL_CLIENT_MESSAGE_NAMESPACES,
  type MessageNamespace,
} from '@/shared/i18n/config';
import {
  appClientMessageNamespaces,
  mergeClientMessageNamespaces,
  pickClientMessages,
} from '@/shared/i18n/pick-client-messages';

/**
 * Exact client-message scope — does NOT merge the authenticated app catalog.
 * Use for public/auth/legal/onboarding routes.
 */
export async function WithClientMessages({
  namespaces,
  children,
}: {
  namespaces: readonly MessageNamespace[];
  children: ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickClientMessages(messages, namespaces)}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * Authenticated owner app shell — ships `APP_CLIENT_MESSAGE_NAMESPACES` plus extras.
 * Mount from `(app)/layout` and owner dashboard at `/[locale]` when signed in.
 */
export async function WithAppClientMessages({
  extra = [],
  children,
}: {
  extra?: readonly MessageNamespace[];
  children: ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={pickClientMessages(messages, appClientMessageNamespaces(...extra))}
    >
      {children}
    </NextIntlClientProvider>
  );
}

/** Contractor portal — project-surface namespaces without the owner app catalog. */
export async function WithPortalClientMessages({
  extra = [],
  children,
}: {
  extra?: readonly MessageNamespace[];
  children: ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={pickClientMessages(
        messages,
        mergeClientMessageNamespaces(CONTRACTOR_PORTAL_CLIENT_MESSAGE_NAMESPACES, ...extra),
      )}
    >
      {children}
    </NextIntlClientProvider>
  );
}
