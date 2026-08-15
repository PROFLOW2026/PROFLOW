/** Public API of the projects module. */
export { createProject } from './application/create-project';
export type { CreateProjectResult } from './application/create-project';
export { createJob } from './application/create-job';
export type { CreateJobResult } from './application/create-job';
export { updateProject } from './application/update-project';
export { upsertPrimaryContractAmount } from './application/contract-amount';
export {
  createAdditionalContract,
  updateContract,
  listProjectContracts,
  setProjectPrimaryContract,
} from './application/manage-contracts';
export type { ProjectContractListItem } from './application/manage-contracts';
export { setJobFixedPrice } from './application/set-job-fixed-price';
export type { SetJobFixedPriceResult } from './application/set-job-fixed-price';
export { convertJobToProject } from './application/convert-job-to-project';
export { archiveProject } from './application/archive-project';
export { restoreProject } from './application/restore-project';
export { listProjectsForOrg } from './application/list-projects';
export { listJobsForOrg } from './application/list-jobs';
export {
  getProjectAccessModeForOrg,
  saveProjectAccessMode,
  listProjectAccessGrantsForOrg,
  grantProjectAccess,
  revokeProjectAccess,
  assertCanAccessProject,
  resolveAccessibleProjectIds,
  isAccessibleProjectId,
} from './application/project-access';
export {
  PROJECT_ACCESS_MODES,
  parseProjectAccessMode,
} from './domain/project-access';
export type { ProjectAccessMode, ProjectAccessLevel } from './domain/project-access';
export {
  assembleProjectDetail,
  countProjectActiveWorkPackages,
  getProjectDetail,
  getProjectDetailChrome,
  getProjectDetailStructure,
} from './application/get-project-detail';
export type {
  GetProjectDetailOptions,
  ProjectClientContactSummary,
  ProjectDetail,
  ProjectDetailChrome,
  ProjectDetailStructure,
} from './application/get-project-detail';
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
export {
  buildProjectArchivePatch,
  buildProjectRestorePatch,
  isProjectSoftArchived,
  isProjectLifecycleClosed,
} from './domain/soft-archive';
export type { ProjectStatusShape } from './domain/status';
export {
  computeCurrentContractValue,
  computeApprovedChangesTotal,
  findOriginalValueEvent,
  isOriginalContractAmountLocked,
} from './domain/contract-value';
export {
  computeEntryBaselineAmounts,
  computeManagedOpeningNet,
  hasStoredOpeningReduction,
  isZeroOpeningReductionAmount,
  normalizeOpeningReductionInput,
  resolveDisplayOriginalEntered,
  resolveDisplayOriginalNet,
  resolveOpeningReductionNet,
} from './domain/entry-baseline';
export type { EntryBaselineAmounts } from './domain/entry-baseline';
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
  WORK_KINDS,
  PRICING_MODES,
  CONTRACT_TYPES,
  CONTRACT_STATUSES,
  DEFAULT_WORK_PACKAGE_NAME,
  usesJobStylePricing,
} from './domain/types';
export type {
  ProjectStatus,
  ProgressStatus,
  MilestoneStatus,
  WorkKind,
  PricingMode,
  ContractType,
  ContractStatus,
  ProjectRecord,
  ProjectListItem,
  ProjectListFilters,
  JobListItem,
  JobBillingPaymentStatus,
  WorkPackageRecord,
  PhaseRecord,
  MilestoneRecord,
  ContractRecord,
  ContractTaxSnapshotRecord,
  ContractValueEventRecord,
} from './domain/types';
export {
  PRICE_NOT_SET_HE,
  PRICE_NOT_SET_MESSAGE_KEY,
  CONVERT_REQUIRES_REVENUE_BASIS_MESSAGE_KEY,
  isOpenPriceJob,
  isJobProfitDefined,
  canConvertJobToProject,
  resolveJobProfitDisplay,
  jobListMissingProfitKind,
} from './domain/job-pricing';
export type { JobProfitDisplay, WorkKindPricingFields } from './domain/job-pricing';
export {
  WORK_LIST_FACETS,
  isWorkListFacet,
  resolveWorkListFacet,
} from './domain/work-list-facets';
export type { WorkListFacet, ResolvedWorkListFacet } from './domain/work-list-facets';

export {
  createProjectSchema,
  createJobSchema,
  setJobFixedPriceSchema,
  convertJobToProjectSchema,
  updateProjectSchema,
  archiveProjectSchema,
  restoreProjectSchema,
  listProjectsSchema,
  listJobsSchema,
  createWorkPackageSchema,
  updateWorkPackageSchema,
  splitProjectSchema,
  createPhaseSchema,
  updatePhaseSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  archiveMilestoneSchema,
  applyProjectTemplateSchema,
  createAdditionalContractSchema,
  updateContractSchema,
  listProjectContractsSchema,
  setPrimaryContractSchema,
} from './validation/schemas';
export type {
  CreateJobInput,
  SetJobFixedPriceInput,
  ConvertJobToProjectInput,
  CreateAdditionalContractInput,
  UpdateContractInput,
} from './validation/schemas';

/** Cross-module org-scoped lookups (FK / tenancy guards). */
export { findProjectById } from './data/projects.repository';
export {
  findWorkPackageById,
  listWorkPackagesForProjects,
  insertWorkPackage,
} from './data/work-packages.repository';
export { findPhaseById } from './data/phases.repository';
