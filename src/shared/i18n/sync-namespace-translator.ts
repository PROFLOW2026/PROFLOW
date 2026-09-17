import { createTranslator } from 'use-intl/core';
import enAssistant from '@/locales/en/assistant.json';
import enAssets from '@/locales/en/assets.json';
import enCommandCenter from '@/locales/en/commandCenter.json';
import enEmployeeApp from '@/locales/en/employeeApp.json';
import enImports from '@/locales/en/imports.json';
import enNotifications from '@/locales/en/notifications.json';
import enRecurringDrafts from '@/locales/en/recurringDrafts.json';
import heAssistant from '@/locales/he-IL/assistant.json';
import heAssets from '@/locales/he-IL/assets.json';
import heCommandCenter from '@/locales/he-IL/commandCenter.json';
import heEmployeeApp from '@/locales/he-IL/employeeApp.json';
import heImports from '@/locales/he-IL/imports.json';
import heNotifications from '@/locales/he-IL/notifications.json';
import heRecurringDrafts from '@/locales/he-IL/recurringDrafts.json';
import { isLocale, type Locale } from './config';
import type { NamespaceTranslator, TranslationValues } from './namespace-translator';

function createSyncTranslator(
  locale: Locale,
  messages: Record<string, unknown>,
): NamespaceTranslator {
  const translator = createTranslator({
    locale,
    messages: messages as Record<string, string>,
  });
  const callable = ((key: string, values?: TranslationValues) =>
    translator(key as never, values as never)) as NamespaceTranslator;
  callable.has = (key: string) => translator.has(key as never);
  return callable;
}

function resolveLocale(locale: string): Locale {
  return isLocale(locale) ? locale : 'he-IL';
}

/** Synchronous translator for unit tests (imports locale JSON directly). */
export function commandCenterCopyTranslator(locale: string): NamespaceTranslator {
  const resolved = resolveLocale(locale);
  const messages = resolved === 'en' ? enCommandCenter : heCommandCenter;
  return createSyncTranslator(resolved, messages);
}

export function notificationsCopyTranslator(locale: string): NamespaceTranslator {
  const resolved = resolveLocale(locale);
  const messages = resolved === 'en' ? enNotifications : heNotifications;
  return createSyncTranslator(resolved, messages);
}

export function employeeAppCopyTranslator(locale: string): NamespaceTranslator {
  const resolved = resolveLocale(locale);
  const messages = resolved === 'en' ? enEmployeeApp : heEmployeeApp;
  return createSyncTranslator(resolved, messages);
}

export function assistantCopyTranslator(locale: string): NamespaceTranslator {
  const resolved = resolveLocale(locale);
  const messages = resolved === 'en' ? enAssistant : heAssistant;
  return createSyncTranslator(resolved, messages);
}

export function importsCopyTranslator(locale: string): NamespaceTranslator {
  const resolved = resolveLocale(locale);
  const messages = resolved === 'en' ? enImports : heImports;
  return createSyncTranslator(resolved, messages);
}

export function recurringDraftsCopyTranslator(locale: string): NamespaceTranslator {
  const resolved = resolveLocale(locale);
  const messages = resolved === 'en' ? enRecurringDrafts : heRecurringDrafts;
  return createSyncTranslator(resolved, messages);
}

export function assetsCopyTranslator(locale: string): NamespaceTranslator {
  const resolved = resolveLocale(locale);
  const messages = resolved === 'en' ? enAssets : heAssets;
  return createSyncTranslator(resolved, messages);
}
