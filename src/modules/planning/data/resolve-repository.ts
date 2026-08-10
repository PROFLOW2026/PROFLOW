import type { DbExecutor } from '@/shared/db/types';
import { ServiceUnavailableError } from '@/shared/errors';
import { arePlanningWritesDurable } from '../domain/persistence';
import { createDrizzlePlanningRepository } from './drizzle-planning.repository';
import {
  createInMemoryPlanningStore,
  getDefaultPlanningStore,
} from './in-memory-planning.store';
import type { PlanningRepository } from './planning.repository';

/**
 * Production default: Drizzle when `PLANNING_PERSISTENCE_READY`.
 * Otherwise returns the in-memory **test double** (not durable).
 */
export function getPlanningRepository(db?: DbExecutor | null): PlanningRepository {
  if (arePlanningWritesDurable()) {
    if (!db) {
      throw new ServiceUnavailableError(
        'Planning persistence is ready but no database executor was provided',
        'planning.errors.dbRequired',
      );
    }
    return createDrizzlePlanningRepository(db);
  }
  return getDefaultPlanningStore();
}

export {
  createDrizzlePlanningRepository,
  createInMemoryPlanningStore,
  getDefaultPlanningStore,
};
