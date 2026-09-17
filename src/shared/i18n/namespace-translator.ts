import { createTranslator } from 'use-intl/core';
import { isLocale, type Locale, type MessageNamespace } from './config';
import { loadMessages } from './messages';

export type TranslationValues = Record<string, string | number | Date>;

/** Locale-aware ICU translator for a single message namespace (server / domain code). */
export interface NamespaceTranslator {
  (key: string, values?: TranslationValues): string;
  has(key: string): boolean;
}

function wrapTranslator(
  translator: ReturnType<typeof createTranslator>,
): NamespaceTranslator {
  const callable = ((key: string, values?: TranslationValues) =>
    translator(key, values)) as NamespaceTranslator;
  callable.has = (key: string) => translator.has(key);
  return callable;
}

export async function createNamespaceTranslator(
  locale: string,
  namespace: MessageNamespace,
): Promise<NamespaceTranslator> {
  const resolvedLocale: Locale = isLocale(locale) ? locale : 'he-IL';
  const messages = await loadMessages(resolvedLocale);
  const translator = createTranslator({
    locale: resolvedLocale,
    messages: { [namespace]: messages[namespace] ?? {} },
    namespace,
  });
  return wrapTranslator(translator);
}

export async function createCommandCenterCopyTranslator(locale: string): Promise<NamespaceTranslator> {
  return createNamespaceTranslator(locale, 'commandCenter');
}

export async function createNotificationsCopyTranslator(locale: string): Promise<NamespaceTranslator> {
  return createNamespaceTranslator(locale, 'notifications');
}

export async function createEmployeeAppCopyTranslator(locale: string): Promise<NamespaceTranslator> {
  return createNamespaceTranslator(locale, 'employeeApp');
}

export async function createAssistantCopyTranslator(locale: string): Promise<NamespaceTranslator> {
  return createNamespaceTranslator(locale, 'assistant');
}

export async function createImportsCopyTranslator(locale: string): Promise<NamespaceTranslator> {
  return createNamespaceTranslator(locale, 'imports');
}

export async function createRecurringDraftsCopyTranslator(locale: string): Promise<NamespaceTranslator> {
  return createNamespaceTranslator(locale, 'recurringDrafts');
}

export async function createAssetsCopyTranslator(locale: string): Promise<NamespaceTranslator> {
  return createNamespaceTranslator(locale, 'assets');
}
