import 'server-only';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { formatProjectDisplayName } from '../domain/display';

/** Batch-load formatted project labels keyed by project id. */
export async function loadProjectDisplayNameMap(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(projectIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db
    .select({ id: projects.id, name: projects.name, documentNumber: projects.documentNumber })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        inArray(projects.id, uniqueIds),
        isNull(projects.archivedAt),
      ),
    );

  return new Map(
    rows.map((row) => [row.id, formatProjectDisplayName(row.name, row.documentNumber)]),
  );
}
