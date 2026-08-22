/**
 * Identify exact duplicate draft time rows (same employee/day/hours/project/kind).
 * Keeps the oldest createdAt; returns ids safe to delete for Owner cleanup.
 */
export function planExactDuplicateDraftRemovals(
  entries: readonly {
    readonly id: string;
    readonly employeeId: string;
    readonly workDate: string;
    readonly hours: string;
    readonly projectId: string | null;
    readonly kind: string;
    readonly approvalStatus: string;
    readonly status: string;
    readonly archivedAt: Date | null;
    readonly createdAt: Date;
  }[],
): readonly { readonly keepId: string; readonly removeIds: readonly string[] }[] {
  type Entry = (typeof entries)[number];
  const groups = new Map<string, Entry[]>();

  for (const entry of entries) {
    if (entry.archivedAt) continue;
    if (entry.status !== 'recorded') continue;
    if (entry.approvalStatus !== 'draft' && entry.approvalStatus !== 'returned') continue;
    const key = [
      entry.employeeId,
      entry.workDate,
      entry.hours,
      entry.projectId ?? '',
      entry.kind,
    ].join('|');
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const plans: { keepId: string; removeIds: string[] }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    const keep = sorted[0]!;
    plans.push({
      keepId: keep.id,
      removeIds: sorted.slice(1).map((row) => row.id),
    });
  }
  return plans;
}
