import type { NoteProjectHint } from './types';

type ProjectNameRow = {
  readonly id: string;
  readonly name: string;
};

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Minimal fuzzy project name hints from free-text owner note.
 * Never used for vendor identity or financial amounts.
 */
export function extractNoteProjectHints(
  ownerNote: string | null | undefined,
  projects: readonly ProjectNameRow[],
  limit = 3,
): readonly NoteProjectHint[] {
  const note = normalizeForMatch(ownerNote ?? '');
  if (!note || note.length < 2) return [];

  const hints: NoteProjectHint[] = [];
  for (const project of projects) {
    const name = normalizeForMatch(project.name);
    if (name.length < 2) continue;
    if (note.includes(name)) {
      hints.push({
        projectId: project.id,
        projectName: project.name,
        matchedSubstring: project.name,
      });
      continue;
    }
    const tokens = name.split(' ').filter((token) => token.length >= 3);
    for (const token of tokens) {
      if (note.includes(token)) {
        hints.push({
          projectId: project.id,
          projectName: project.name,
          matchedSubstring: token,
        });
        break;
      }
    }
  }

  return hints.slice(0, limit);
}
