/**
 * Planning defaults to classic projects only.
 * Jobs (`work_kind=job`) stay opt-out — never force heavy planning onto them.
 */

import type { WorkKind } from '@/modules/projects/domain/types';

export const PLANNING_JOBS_OPT_OUT_MESSAGE = 'planning.jobsOptOut';

export function isPlanningEligibleWorkKind(workKind: WorkKind): boolean {
  return workKind === 'project';
}

export function assertPlanningEligible(workKind: WorkKind): void {
  if (!isPlanningEligibleWorkKind(workKind)) {
    throw new PlanningEligibilityError(PLANNING_JOBS_OPT_OUT_MESSAGE);
  }
}

export class PlanningEligibilityError extends Error {
  readonly code = PLANNING_JOBS_OPT_OUT_MESSAGE;

  constructor(message: string = PLANNING_JOBS_OPT_OUT_MESSAGE) {
    super(message);
    this.name = 'PlanningEligibilityError';
  }
}
