export type ProjectTeamSourceTag = 'roster' | 'capabilities' | 'access';

export interface UnifiedTeamRosterRow {
  readonly employeeId: string;
  readonly displayName: string;
  readonly jobTitle: string | null;
}

export interface UnifiedTeamCapabilityRow {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
}

export interface UnifiedTeamAccessRow {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
}

export interface UnifiedProjectTeamMember {
  readonly key: string;
  readonly displayName: string;
  readonly tags: readonly ProjectTeamSourceTag[];
  readonly employeeId: string | null;
  readonly userId: string | null;
}

export interface UnifiedProjectTeamSources {
  readonly roster: readonly UnifiedTeamRosterRow[];
  readonly capabilities: readonly UnifiedTeamCapabilityRow[];
  readonly access: readonly UnifiedTeamAccessRow[];
}

function memberKeyFromRoster(row: UnifiedTeamRosterRow): string {
  return `employee:${row.employeeId}`;
}

function memberKeyFromUser(userId: string): string {
  return `user:${userId}`;
}

/**
 * Pure merge: one person → one row with source tags (OD-08).
 */
export function mergeProjectTeamSources(
  sources: UnifiedProjectTeamSources,
): readonly UnifiedProjectTeamMember[] {
  const map = new Map<string, UnifiedProjectTeamMember>();

  for (const row of sources.roster) {
    const key = memberKeyFromRoster(row);
    map.set(key, {
      key,
      displayName: row.displayName,
      tags: ['roster'],
      employeeId: row.employeeId,
      userId: null,
    });
  }

  for (const row of sources.capabilities) {
    const key = memberKeyFromUser(row.userId);
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        tags: [...new Set([...existing.tags, 'capabilities'] as const)],
        userId: row.userId,
        displayName: existing.displayName || row.displayName,
      });
    } else {
      map.set(key, {
        key,
        displayName: row.displayName,
        tags: ['capabilities'],
        employeeId: null,
        userId: row.userId,
      });
    }
  }

  for (const row of sources.access) {
    const key = memberKeyFromUser(row.userId);
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        tags: [...new Set([...existing.tags, 'access'] as const)],
        userId: row.userId,
        displayName: existing.displayName || row.displayName,
      });
    } else {
      map.set(key, {
        key,
        displayName: row.displayName,
        tags: ['access'],
        employeeId: null,
        userId: row.userId,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function unifiedTeamHasMembers(sources: UnifiedProjectTeamSources): boolean {
  return mergeProjectTeamSources(sources).length > 0;
}
