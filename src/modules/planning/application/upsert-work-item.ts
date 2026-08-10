import { randomUUID } from 'node:crypto';
import type { WorkKind } from '@/modules/projects/domain/types';
import type { DbExecutor } from '@/shared/db/types';
import type { PlanningRepository } from '../data/planning.repository';
import { getPlanningRepository } from '../data/resolve-repository';
import { assertPlanningEligible } from '../domain/eligibility';
import type { PlanningWorkItem } from '../domain/types';
import {
  upsertPlanningWorkItemSchema,
  type UpsertPlanningWorkItemRawInput,
} from '../validation/schemas';
import {
  assertPlanningHierarchy,
  type PlanningHierarchyLookups,
} from './assert-hierarchy';

export interface UpsertPlanningWorkItemOptions {
  readonly repo?: PlanningRepository;
  readonly db?: DbExecutor | null;
  readonly lookups?: PlanningHierarchyLookups;
}

export async function upsertPlanningWorkItem(
  input: UpsertPlanningWorkItemRawInput & { readonly workKind: WorkKind },
  options: UpsertPlanningWorkItemOptions | PlanningRepository = {},
): Promise<PlanningWorkItem> {
  // Back-compat: second arg used to be the repository directly.
  const opts: UpsertPlanningWorkItemOptions =
    options && 'upsertWorkItem' in options
      ? { repo: options as PlanningRepository }
      : (options as UpsertPlanningWorkItemOptions);

  assertPlanningEligible(input.workKind);
  const parsed = upsertPlanningWorkItemSchema.parse(input);
  const repo = opts.repo ?? getPlanningRepository(opts.db);

  await assertPlanningHierarchy({
    organizationId: parsed.organizationId,
    projectId: parsed.projectId,
    phaseId: parsed.phaseId,
    workPackageId: parsed.workPackageId,
    db: opts.db,
    lookups: opts.lookups,
  });

  const now = new Date();

  let existing: PlanningWorkItem | undefined;
  if (parsed.workItemId) {
    const plan = await repo.getPlan(parsed.organizationId, parsed.projectId);
    existing = plan.workItems.find((item) => item.id === parsed.workItemId);
  }

  const progress =
    parsed.kind === 'milestone'
      ? parsed.actualEndDate || parsed.progressPercent >= 100
        ? 100
        : parsed.progressPercent
      : parsed.progressPercent;

  const item: PlanningWorkItem = {
    id: existing?.id ?? parsed.workItemId ?? randomUUID(),
    organizationId: parsed.organizationId,
    projectId: parsed.projectId,
    name: parsed.name,
    kind: parsed.kind,
    startDate: parsed.kind === 'milestone' ? parsed.targetEndDate ?? parsed.startDate : parsed.startDate,
    targetEndDate: parsed.targetEndDate ?? (parsed.kind === 'milestone' ? parsed.startDate : null),
    actualEndDate: parsed.actualEndDate,
    progressPercent: progress,
    phaseId: parsed.phaseId,
    workPackageId: parsed.workPackageId,
    sortOrder: parsed.sortOrder,
    archivedAt: existing?.archivedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return repo.upsertWorkItem(item);
}

export async function archivePlanningWorkItem(
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly workItemId: string;
    readonly workKind: WorkKind;
  },
  options: UpsertPlanningWorkItemOptions | PlanningRepository = {},
): Promise<void> {
  const opts: UpsertPlanningWorkItemOptions =
    options && 'upsertWorkItem' in options
      ? { repo: options as PlanningRepository }
      : (options as UpsertPlanningWorkItemOptions);

  assertPlanningEligible(input.workKind);
  const repo = opts.repo ?? getPlanningRepository(opts.db);
  await repo.archiveWorkItem(
    input.organizationId,
    input.projectId,
    input.workItemId,
    new Date(),
  );
}
