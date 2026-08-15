/**
 * Pack workforce/site notes and blockers into the single `workforce_notes`
 * column (no schema change in Wave 3). Marker is stable for round-trips.
 */

export const DAILY_LOG_BLOCKERS_MARKER = '\n\n--- blockers ---\n';

const BLOCKERS_ONLY_PREFIX = '--- blockers ---\n';

export function packWorkforceAndBlockers(
  workforceNotes: string | null | undefined,
  blockers: string | null | undefined,
): string | null {
  const workforce = workforceNotes?.trim() ?? '';
  const blockersText = blockers?.trim() ?? '';
  if (!workforce && !blockersText) return null;
  if (!blockersText) return workforce;
  if (!workforce) return `${BLOCKERS_ONLY_PREFIX}${blockersText}`;
  return `${workforce}${DAILY_LOG_BLOCKERS_MARKER}${blockersText}`;
}

export const DAILY_LOG_CORRECTION_MARKER = '\n\n--- correction ---\n';

export function appendDailyLogCorrectionNote(
  existing: string | null | undefined,
  note: string,
  at: Date,
): string {
  const trimmed = note.trim();
  const block = `[${at.toISOString()}]\n${trimmed}`;
  if (!existing?.trim()) return `--- correction ---\n${block}`;
  return `${existing.trimEnd()}${DAILY_LOG_CORRECTION_MARKER}${block}`;
}

export function unpackWorkforceAndBlockers(stored: string | null | undefined): {
  workforceNotes: string | null;
  blockers: string | null;
} {
  if (!stored) return { workforceNotes: null, blockers: null };

  const sepIndex = stored.indexOf(DAILY_LOG_BLOCKERS_MARKER);
  if (sepIndex !== -1) {
    const workforce = stored.slice(0, sepIndex).trim();
    const blockers = stored.slice(sepIndex + DAILY_LOG_BLOCKERS_MARKER.length).trim();
    return {
      workforceNotes: workforce || null,
      blockers: blockers || null,
    };
  }

  if (stored.startsWith(BLOCKERS_ONLY_PREFIX)) {
    const blockers = stored.slice(BLOCKERS_ONLY_PREFIX.length).trim();
    return { workforceNotes: null, blockers: blockers || null };
  }

  return { workforceNotes: stored, blockers: null };
}
