import { formatMoneyString } from '@/shared/money/format';
import { assistantCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import type { AssistantToolKey } from './types';

export function assistantDeniedBody(locale: string): string {
  return assistantCopyTranslator(locale)('errors.noPermission');
}

export function assistantToolTitle(locale: string, tool: AssistantToolKey): string {
  return assistantCopyTranslator(locale)(`toolCopy.tools.${tool}`);
}

export function warningKindLabel(locale: string, kind: string): string {
  const t = assistantCopyTranslator(locale);
  const key = `toolCopy.warningKinds.${kind}`;
  return t.has(key) ? t(key) : t('toolCopy.warningKinds.fallback');
}

export const assistantToolCopy = {
  todayEmpty: (locale: string) => assistantCopyTranslator(locale)('toolCopy.todayEmpty'),
  profitNeedProject: (locale: string) => assistantCopyTranslator(locale)('toolCopy.profitNeedProject'),
  profitNotSet: (locale: string) => assistantCopyTranslator(locale)('toolCopy.profitNotSet'),
  profitHidden: (locale: string) => assistantCopyTranslator(locale)('toolCopy.profitHidden'),
  profitBody: (locale: string, forecast: string, actual: string, currency: string) =>
    assistantCopyTranslator(locale)('toolCopy.profitBody', {
      forecastLabel: formatMoneyString(forecast, currency, locale),
      actualLabel: formatMoneyString(actual, currency, locale),
    }),
  clientsEmpty: (locale: string) => assistantCopyTranslator(locale)('toolCopy.clientsEmpty'),
  payEmpty: (locale: string) => assistantCopyTranslator(locale)('toolCopy.payEmpty'),
  riskEmpty: (locale: string) => assistantCopyTranslator(locale)('toolCopy.riskEmpty'),
  billsEmpty: (locale: string) => assistantCopyTranslator(locale)('toolCopy.billsEmpty'),
  billsCount: (locale: string, count: number) =>
    assistantCopyTranslator(locale)('toolCopy.billsCount', { count }),
  explainNumber: (locale: string) => assistantCopyTranslator(locale)('toolCopy.explainNumber'),
  documentsEmpty: (locale: string) => assistantCopyTranslator(locale)('toolCopy.documentsEmpty'),
  draftExpense: (locale: string) => assistantCopyTranslator(locale)('toolCopy.draftExpense'),
  draftReminder: (locale: string) => assistantCopyTranslator(locale)('toolCopy.draftReminder'),
  financialsLabel: (locale: string) => assistantCopyTranslator(locale)('toolCopy.financialsLabel'),
  expensesLabel: (locale: string) => assistantCopyTranslator(locale)('toolCopy.expensesLabel'),
  reminderLabel: (locale: string) => assistantCopyTranslator(locale)('toolCopy.reminderLabel'),
  messagesLabel: (locale: string) => assistantCopyTranslator(locale)('toolCopy.messagesLabel'),
};
