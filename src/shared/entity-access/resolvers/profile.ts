import { and, eq } from 'drizzle-orm';
import { projectLocations } from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers owned by the 'profile' track. One resolver per entity type that supports threads/attachments/evidence. */
export const PROFILE_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    // Locations are project-wide (no vendor): visible to contractors who can see the project. A contractor grant
    // may be restricted to specific locations, so the path (self + ancestors) travels with the scope.
    entityType: 'project_location',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: projectLocations.organizationId,
          projectId: projectLocations.projectId,
          parentId: projectLocations.parentId,
        })
        .from(projectLocations)
        .where(and(eq(projectLocations.id, entityId), eq(projectLocations.organizationId, organizationId)))
        .limit(1);
      if (!row) return null;

      const path: string[] = [entityId];
      let parentId = row.parentId;
      if (parentId) {
        const all = await db
          .select({ id: projectLocations.id, parentId: projectLocations.parentId })
          .from(projectLocations)
          .where(and(eq(projectLocations.organizationId, organizationId), eq(projectLocations.projectId, row.projectId)));
        const parents = new Map(all.map((node) => [node.id, node.parentId]));
        while (parentId && !path.includes(parentId) && path.length < 64) {
          path.push(parentId);
          parentId = parents.get(parentId) ?? null;
        }
      }
      return { organizationId: row.organizationId, projectId: row.projectId, locationPath: path };
    },
  },
];
