import type { DbExecutor } from '@/shared/db/types';
import { eq } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import {
  taskDependencyPolicyFromModuleConfig,
  type TaskDependencyPolicy,
} from '../domain/dependency-policy';

/** Org-level task dependency enforcement (`organizations.module_config.tasks.dependencyPolicy`). */
export async function readTaskDependencyPolicy(
  db: DbExecutor,
  organizationId: string,
): Promise<TaskDependencyPolicy> {
  const [row] = await db
    .select({ moduleConfig: organizations.moduleConfig })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return taskDependencyPolicyFromModuleConfig(row?.moduleConfig);
}
