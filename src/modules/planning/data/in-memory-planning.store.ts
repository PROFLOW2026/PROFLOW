import type { PlanningRepository } from './planning.repository';
import type {
  PlanningDependency,
  PlanningPlanSnapshot,
  PlanningWorkItem,
} from '../domain/types';

interface ProjectBucket {
  workItems: Map<string, PlanningWorkItem>;
  dependencies: Map<string, PlanningDependency>;
}

function bucketKey(organizationId: string, projectId: string): string {
  return `${organizationId}:${projectId}`;
}

/**
 * In-memory planning store — **TEST DOUBLE ONLY**.
 *
 * Not durable across restarts. Production paths use Drizzle when
 * `PLANNING_PERSISTENCE_READY` is true.
 */
export function createInMemoryPlanningStore(): PlanningRepository {
  const buckets = new Map<string, ProjectBucket>();

  function getBucket(organizationId: string, projectId: string): ProjectBucket {
    const key = bucketKey(organizationId, projectId);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { workItems: new Map(), dependencies: new Map() };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  return {
    async getPlan(organizationId, projectId): Promise<PlanningPlanSnapshot> {
      const bucket = getBucket(organizationId, projectId);
      return {
        organizationId,
        projectId,
        workItems: [...bucket.workItems.values()].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
        dependencies: [...bucket.dependencies.values()],
      };
    },

    async upsertWorkItem(item): Promise<PlanningWorkItem> {
      const bucket = getBucket(item.organizationId, item.projectId);
      bucket.workItems.set(item.id, item);
      return item;
    },

    async archiveWorkItem(organizationId, projectId, workItemId, archivedAt) {
      const bucket = getBucket(organizationId, projectId);
      const existing = bucket.workItems.get(workItemId);
      if (!existing) return;
      bucket.workItems.set(workItemId, { ...existing, archivedAt, updatedAt: archivedAt });
      for (const [depId, dep] of bucket.dependencies) {
        if (dep.predecessorId === workItemId || dep.successorId === workItemId) {
          bucket.dependencies.delete(depId);
        }
      }
    },

    async addDependency(dependency) {
      const bucket = getBucket(dependency.organizationId, dependency.projectId);
      bucket.dependencies.set(dependency.id, dependency);
      return dependency;
    },

    async removeDependency(organizationId, projectId, dependencyId) {
      const bucket = getBucket(organizationId, projectId);
      bucket.dependencies.delete(dependencyId);
    },
  };
}

/** Shared process-local test-double store until Drizzle is the production default. */
let defaultStore: PlanningRepository | null = null;

export function getDefaultPlanningStore(): PlanningRepository {
  if (!defaultStore) defaultStore = createInMemoryPlanningStore();
  return defaultStore;
}

export function resetDefaultPlanningStoreForTests(): void {
  defaultStore = createInMemoryPlanningStore();
}
