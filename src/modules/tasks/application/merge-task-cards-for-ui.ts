import type { TaskCardData } from '../ui/task-api';

/** Appends tasks without duplicating ids; preserves order of existing rows. */
export function mergeTaskCardsById(
  existing: readonly TaskCardData[],
  incoming: readonly TaskCardData[],
): TaskCardData[] {
  if (incoming.length === 0) return [...existing];
  const seen = new Set(existing.map((t) => t.id));
  const out = [...existing];
  for (const task of incoming) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    out.push(task);
  }
  return out;
}
