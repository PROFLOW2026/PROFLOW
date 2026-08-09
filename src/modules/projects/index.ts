/** Public API of the projects module. */
export { createProject } from './application/create-project';
export type { CreateProjectResult } from './application/create-project';
export { updateProject } from './application/update-project';
export { upsertPrimaryContractAmount } from './application/contract-amount';
export { archiveProject } from './application/archive-project';
export { listProjectsForOrg } from './application/list-projects';
export { getProjectDetail } from './application/get-project-detail';
export type { GetProjectDetailOptions, ProjectDetail } from './application/get-project-detail';
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
export { applyProjectTemplate } from './application/apply-project-template';
export type { ApplyProjectTemplateResult } from './application/apply-project-template';

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
  buildScheduleSummary,
  isEndBeforeStart,
  isMilestoneOverdue,
  isPhaseOverdue,
  isProjectTargetOverdue,
  isWorkPackageOverdue,
  parseProgressPercent,
  resolveProjectProgressPercent,
  rollupWorkPackageProgress,
  toProgressReportLine,
  DATE_ORDER_MESSAGE,
} from './domain/scheduling';
export type { ScheduleSummary, ProgressReportLine } from './domain/scheduling';
export {
  PROJECT_TEMPLATE_KEYS,
  PROJECT_TEMPLATES,
  getProjectTemplate,
  previewProjectTemplate,
  cloneProjectTemplateForApply,
  offsetBusinessDate,
} from './domain/templates';
export type {
  ProjectTemplate,
  ProjectTemplateKey,
  ProjectTemplatePreview,
  ProjectTemplateApplyCopy,
  TemplateLocale,
} from './domain/templates';
export { selectProjectWorkspaceLinks } from './domain/workspace-links';
export type {
  ProjectWorkspaceLink,
  ProjectWorkspaceLinkKey,
  WorkspaceLinkInput,
} from './domain/workspace-links';
export {
  CONTRACT_VALUE_REASON_ORIGINAL,
  CONTRACT_VALUE_REASON_CHANGE_ORDER_PREFIX,
  formatChangeOrderContractReason,
  contractValueReasonPresentation,
  contractValueReasonMessageKey,
} from './domain/contract-value-reason';
export type {
  ContractValueReasonMessageKey,
  ContractValueReasonPresentation,
} from './domain/contract-value-reason';
export {
  applyOrgProjectTemplate,
  applyOrgPhasePack,
  applyOrgWorkPackagePack,
} from './application/apply-org-template';
export type { ApplyOrgProjectTemplateResult } from './application/apply-org-template';
export {
  cloneProjectStructure,
  previewProjectStructureSnapshot,
} from './application/clone-project-structure';
export type { ProjectStructureSnapshot } from './application/clone-project-structure';
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
  applyProjectTemplateSchema,
} from './validation/schemas';

/** Cross-module org-scoped lookups (FK / tenancy guards). */
export { findProjectById } from './data/projects.repository';
export {
  findWorkPackageById,
  listWorkPackagesForProjects,
} from './data/work-packages.repository';
