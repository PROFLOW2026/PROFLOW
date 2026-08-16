/**
 * Planning / Timeline / Gantt V1 (Agent 6 overnight + PRE-SQL Agent D).
 *
 * Useful project planning - not MS Project. Jobs opt-out by default.
 * Critical Path: foundations only (`supported: false`) - see LIMITATION.md.
 * Persistence: Drizzle when `PLANNING_PERSISTENCE_READY`; otherwise in-memory
 * is a **test double only**.
 */

export type {
  CriticalPathFoundation,
  GanttBar,
  GanttModel,
  IsoDate,
  PlanningDependency,
  PlanningDependencyType,
  PlanningOverdueFlags,
  PlanningPlanSnapshot,
  PlanningWorkItem,
  PlanningWorkItemKind,
} from './domain/types';
export {
  PLANNING_DEPENDENCY_TYPES,
  PLANNING_WORK_ITEM_KINDS,
} from './domain/types';

export {
  assertPlanningEligible,
  isPlanningEligibleWorkKind,
  PlanningEligibilityError,
  PLANNING_JOBS_OPT_OUT_MESSAGE,
} from './domain/eligibility';

export {
  validateDependencyGraph,
  wouldCreateCycle,
  collectPredecessorChain,
  DEPENDENCY_CYCLE_MESSAGE,
  DEPENDENCY_UNKNOWN_ITEM_MESSAGE,
  DEPENDENCY_SELF_MESSAGE,
  DEPENDENCY_CROSS_PROJECT_MESSAGE,
} from './domain/dependencies';
export type {
  DependencyValidationResult,
  DependencyValidationOk,
  DependencyValidationFail,
} from './domain/dependencies';

export {
  assertPhaseBelongsToProject,
  assertWorkPackageBelongsToProject,
  assertProjectBelongsToOrganization,
  PHASE_CROSS_PROJECT_MESSAGE,
  WORK_PACKAGE_CROSS_PROJECT_MESSAGE,
  PROJECT_ORG_MISMATCH_MESSAGE,
} from './domain/hierarchy';

export {
  PLANNING_PERSISTENCE_READY,
  arePlanningWritesDurable,
  setPlanningPersistenceReadyForTests,
} from './domain/persistence';

export {
  isWorkItemOverdue,
  detectWorkItemOverdue,
  listOverdueWorkItems,
  countOverdueWorkItems,
} from './domain/overdue';

export { buildGanttModel } from './domain/gantt-layout';
export { buildCriticalPathFoundation } from './domain/critical-path-foundation';

export {
  isIsoDate,
  isEndBeforeStart,
  calendarDaysBetween,
  inclusiveDurationDays,
  DATE_ORDER_MESSAGE,
} from './domain/dates';

export { listPlanningPlan } from './application/list-plan';
export type { PlanningPlanView } from './application/list-plan';
export {
  upsertPlanningWorkItem,
  archivePlanningWorkItem,
} from './application/upsert-work-item';
export {
  setPlanningDependency,
  removePlanningDependency,
  PlanningDependencyError,
} from './application/set-dependency';
export { assertPlanningHierarchy } from './application/assert-hierarchy';

export type { PlanningRepository } from './data/planning.repository';
export {
  createInMemoryPlanningStore,
  getDefaultPlanningStore,
  resetDefaultPlanningStoreForTests,
} from './data/in-memory-planning.store';
export { createDrizzlePlanningRepository } from './data/drizzle-planning.repository';
export { getPlanningRepository } from './data/resolve-repository';

export {
  upsertPlanningWorkItemSchema,
  setPlanningDependencySchema,
  removePlanningDependencySchema,
  listPlanningPlanSchema,
} from './validation/schemas';
export type {
  UpsertPlanningWorkItemInput,
  UpsertPlanningWorkItemRawInput,
  SetPlanningDependencyInput,
  SetPlanningDependencyRawInput,
  RemovePlanningDependencyInput,
  ListPlanningPlanInput,
} from './validation/schemas';
