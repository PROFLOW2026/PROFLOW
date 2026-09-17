/**
 * System-generated note appended to entities created from recurring templates.
 * Only this known pattern is localized — user-written notes are never touched.
 */

import { resolveLabelLocale } from '@/shared/i18n/intl-locale';
import { recurringDraftsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';

const EN_PATTERN =
  /^Generated from recurring draft [“"](.+)[”"]\.(?: Draft only(?: - not posted)?)?$/;

export function recurringDraftGeneratedNote(
  templateTitle: string,
  locale: string,
  options?: { readonly draftOnly?: boolean },
): string {
  const title = templateTitle.trim();
  const t = recurringDraftsCopyTranslator(locale);
  if (options?.draftOnly) {
    return t('generatedNote.bodyDraftOnly', { title });
  }
  return t('generatedNote.body', { title });
}

/** Detect English system note for display-time localization of legacy rows. */
export function localizeLegacyRecurringDraftNote(
  notes: string | null | undefined,
  locale: string,
): string | null {
  if (!notes?.trim() || resolveLabelLocale(locale) !== 'he-IL') return notes ?? null;
  const lines = notes.split('\n');
  const localized = lines.map((line) => {
    const match = line.trim().match(EN_PATTERN);
    if (!match) return line;
    const draftOnly = line.includes('Draft only');
    return recurringDraftGeneratedNote(match[1]!, locale, { draftOnly });
  });
  return localized.join('\n');
}
