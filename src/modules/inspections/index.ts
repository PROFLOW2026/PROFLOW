/** Public API for the quality Inspections module (Developer/GC, Track MN). */

export { INSPECTION_CATALOG, INSPECTION_CATEGORIES, findCatalogTemplate } from './domain/catalog';
export {
  CHECK_RESULTS,
  INSPECTION_OUTCOMES,
  INSPECTION_STATUSES,
  suggestedOutcome,
  tallyChecklist,
  validateOutcome,
  type CheckResult,
  type InspectionOutcome,
  type InspectionStatus,
} from './domain/rules';
export type { ContractorInspectionDetail } from './application/contractor-inspections';
export type {
  ContractorInspectionItem,
  CustomTemplateView,
  InspectionDetail,
  InspectionListFilters,
  InspectionListItem,
  InspectionListPage,
  InspectionTemplateOption,
} from './domain/types';

export {
  cancelInspection,
  createInspection,
  recordInspectionOutcome,
  saveChecklistResults,
  startInspection,
  startReinspection,
  updateInspection,
  type RecordOutcomeResult,
} from './application/manage-inspections';
export { archiveInspectionTemplate, createInspectionTemplate } from './application/manage-templates';
export {
  countProjectInspections,
  getInspectionDetail,
  getInspectionPermissions,
  listInspectionTemplateOptions,
  listProjectInspections,
  loadInspectionFormData,
  type InspectionDetailView,
  type InspectionFormData,
  type InspectionPermissions,
} from './application/query-inspections';
export { getContractorInspection, listContractorInspections } from './application/contractor-inspections';
export type {
  CreateInspectionInput,
  CreateTemplateInput,
  RecordOutcomeInput,
  UpdateInspectionInput,
} from './validation/schemas';
