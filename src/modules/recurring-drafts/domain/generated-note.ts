/**
 * System-generated note appended to entities created from recurring templates.
 * Only this known pattern is localized — user-written notes are never touched.
 */

const EN_PATTERN =
  /^Generated from recurring draft [“"](.+)[”"]\.(?: Draft only(?: - not posted)?)?$/;
const HE_PREFIX = 'נוצר אוטומטית מהוצאה חוזרת';

export function recurringDraftGeneratedNote(
  templateTitle: string,
  locale: string,
  options?: { readonly draftOnly?: boolean },
): string {
  const title = templateTitle.trim();
  if (locale.startsWith('he')) {
    if (options?.draftOnly) {
      return `${HE_PREFIX} "${title}". טיוטה בלבד.`;
    }
    return `${HE_PREFIX} "${title}".`;
  }
  if (options?.draftOnly) {
    return `Generated from recurring draft "${title}". Draft only.`;
  }
  return `Generated from recurring draft "${title}".`;
}

/** Detect English system note for display-time localization of legacy rows. */
export function localizeLegacyRecurringDraftNote(
  notes: string | null | undefined,
  locale: string,
): string | null {
  if (!notes?.trim() || !locale.startsWith('he')) return notes ?? null;
  const lines = notes.split('\n');
  const localized = lines.map((line) => {
    const match = line.trim().match(EN_PATTERN);
    if (!match) return line;
    const draftOnly = line.includes('Draft only');
    return recurringDraftGeneratedNote(match[1]!, locale, { draftOnly });
  });
  return localized.join('\n');
}
