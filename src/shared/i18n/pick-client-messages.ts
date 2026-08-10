import type { AbstractIntlMessages } from 'next-intl';
import {
  APP_CLIENT_MESSAGE_NAMESPACES,
  type MessageNamespace,
} from './config';

/**
 * Selects message namespaces for `NextIntlClientProvider`.
 *
 * Full catalogs stay available to Server Components via `getRequestConfig`;
 * only these keys are serialized into the RSC flight for the browser.
 */
export function pickClientMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly MessageNamespace[] = APP_CLIENT_MESSAGE_NAMESPACES,
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const namespace of namespaces) {
    const value = messages[namespace];
    if (value !== undefined) {
      picked[namespace] = value;
    }
  }
  return picked;
}

/** Merge base app client namespaces with route-specific extras (deduped). */
export function clientMessageNamespaces(
  ...extra: readonly MessageNamespace[]
): MessageNamespace[] {
  const set = new Set<MessageNamespace>(APP_CLIENT_MESSAGE_NAMESPACES);
  for (const namespace of extra) {
    set.add(namespace);
  }
  return [...set];
}
