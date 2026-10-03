import { and, eq } from 'drizzle-orm';
import { projectLocations } from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers owned by the 'profile' track. One resolver per entity type that supports threads/attachments/evidence. */
export const PROFILE_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    // Locations are project-wide (no vendor): visible to contractors who can see the project.
    entityType: 'project_location',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({ organizationId: projectLocations.organizationId, projectId: projectLocations.projectId })
        .from(projectLocations)
        .where(and(eq(projectLocations.id, entityId), eq(projectLocations.organizationId, organizationId)))
        .limit(1);
      return row ? { organizationId: row.organizationId, projectId: row.projectId } : null;
    },
  },
];
