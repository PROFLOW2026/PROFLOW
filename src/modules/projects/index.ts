/** Public API of the projects module. */
export { createProject } from './application/create-project';
export type { CreateProjectResult } from './application/create-project';
export { updateProject } from './application/update-project';
export { upsertPrimaryContractAmount } from './application/contract-amount';
export { archiveProject } from './application/archive-project';
export { listProjectsForOrg } from './application/list-projects';
export { getProjectDetail } from './application/get-project-detail';
export type { ProjectDetail } from './application/get-project-detail';
export {
  createWorkPackage,
  updateWorkPackage,
  archiveWorkPackage,
  splitProjectIntoWorkPackages,
} from './application/work-packages';
export { createPhase, updatePhase, archivePhase } from './application/phases';
export {
  listProjectMilestones,
  createMilestone,
  updateMilestone,
  archiveMilestone,
} from './application/milestones';

export { projectStatusShape, isArchivedStatus } from './domain/status';
export type { ProjectStatusShape } from './domain/status';
export {
  computeCurrentContractValue,
  computeApprovedChangesTotal,
  findOriginalValueEvent,
  isOriginalContractAmountLocked,
} from './domain/contract-value';
export { ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY } from './application/contract-amount';
export { shouldShowWorkPackages, countActiveWorkPackages } from './domain/work-package-visibility';
export {
  PROJECT_STATUSES,
  PROGRESS_STATUSES,
  MILESTONE_STATUSES,
  DEFAULT_WORK_PACKAGE_NAME,
} from './domain/types';
export type {
  ProjectStatus,
  ProgressStatus,
  MilestoneStatus,
  ProjectRecord,
  ProjectListItem,
  ProjectListFilters,
  WorkPackageRecord,
  PhaseRecord,
  MilestoneRecord,
  ContractRecord,
  ContractTaxSnapshotRecord,
  ContractValueEventRecord,
} from './domain/types';

export {
  createProjectSchema,
  updateProjectSchema,
  archiveProjectSchema,
  listProjectsSchema,
  createWorkPackageSchema,
  updateWorkPackageSchema,
  splitProjectSchema,
  createPhaseSchema,
  updatePhaseSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  archiveMilestoneSchema,
} from './validation/schemas';
