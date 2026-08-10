import { randomUUID } from 'node:crypto';
import type { WorkKind } from '@/modules/projects/domain/types';
import type { DbExecutor } from '@/shared/db/types';
import type { PlanningRepository } from '../data/planning.repository';
import { getPlanningRepository } from '../data/resolve-repository';
import {
  DEPENDENCY_CYCLE_MESSAGE,
  validateDependencyGraph,
} from '../domain/dependencies';
import { assertPlanningEligible } from '../domain/eligibility';
import type { PlanningDependency } from '../domain/types';
import {
  removePlanningDependencySchema,
  setPlanningDependencySchema,
  type RemovePlanningDependencyInput,
  type SetPlanningDependencyRawInput,
} from '../validation/schemas';

export class PlanningDependencyError extends Error {
  constructor(
    message: string,
    readonly cycleNodeIds: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PlanningDependencyError';
  }
}

export interface PlanningDependencyOptions {
  readonly repo?: PlanningRepository;
  readonly db?: DbExecutor | null;
}

export async function setPlanningDependency(
  input: SetPlanningDependencyRawInput & { readonly workKind: WorkKind },
  options: PlanningDependencyOptions | PlanningRepository = {},
): Promise<PlanningDependency> {
  const opts: PlanningDependencyOptions =
    options && 'addDependency' in options
      ? { repo: options as PlanningRepository }
      : (options as PlanningDependencyOptions);

  assertPlanningEligible(input.workKind);
  const parsed = setPlanningDependencySchema.parse(input);
  const repo = opts.repo ?? getPlanningRepository(opts.db);
  const plan = await repo.getPlan(parsed.organizationId, parsed.projectId);

  const candidate: PlanningDependency = {
    id: randomUUID(),
    organizationId: parsed.organizationId,
    projectId: parsed.projectId,
    predecessorId: parsed.predecessorId,
    successorId: parsed.successorId,
    type: parsed.type,
    createdAt: new Date(),
  };

  const validation = validateDependencyGraph({
    workItems: plan.workItems,
    dependencies: [...plan.dependencies, candidate],
    projectId: parsed.projectId,
  });

  if (!validation.ok) {
    throw new PlanningDependencyError(
      validation.message,
      validation.message === DEPENDENCY_CYCLE_MESSAGE ? validation.cycleNodeIds : [],
    );
  }

  const duplicate = plan.dependencies.find(
    (d) =>
      d.predecessorId === candidate.predecessorId && d.successorId === candidate.successorId,
  );
  if (duplicate) return duplicate;

  return repo.addDependency(candidate);
}

export async function removePlanningDependency(
  input: RemovePlanningDependencyInput & { readonly workKind: WorkKind },
  options: PlanningDependencyOptions | PlanningRepository = {},
): Promise<void> {
  const opts: PlanningDependencyOptions =
    options && 'addDependency' in options
      ? { repo: options as PlanningRepository }
      : (options as PlanningDependencyOptions);

  assertPlanningEligible(input.workKind);
  const parsed = removePlanningDependencySchema.parse(input);
  const repo = opts.repo ?? getPlanningRepository(opts.db);
  await repo.removeDependency(parsed.organizationId, parsed.projectId, parsed.dependencyId);
}
