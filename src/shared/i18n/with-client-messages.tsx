import { getLocale, getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { IntlClientProvider } from '@/shared/i18n/intl-client-provider';
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
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  return (
    <IntlClientProvider locale={locale} messages={pickClientMessages(messages, namespaces)}>
      {children}
    </IntlClientProvider>
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
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  return (
    <IntlClientProvider
      locale={locale}
      messages={pickClientMessages(messages, appClientMessageNamespaces(...extra))}
    >
      {children}
    </IntlClientProvider>
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
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  return (
    <IntlClientProvider
      locale={locale}
      messages={pickClientMessages(
        messages,
        mergeClientMessageNamespaces(CONTRACTOR_PORTAL_CLIENT_MESSAGE_NAMESPACES, ...extra),
      )}
    >
      {children}
    </IntlClientProvider>
  );
}
