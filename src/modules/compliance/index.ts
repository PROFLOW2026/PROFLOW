/** Public API of the compliance module (doc 24). */
export { createComplianceArtifact } from './application/create-artifact';
export { updateComplianceArtifact } from './application/update-artifact';
export { archiveComplianceArtifact } from './application/archive-artifact';
export {
  listComplianceArtifactsForOrg,
  getComplianceArtifactById,
} from './application/list-artifacts';

export {
  ARTIFACT_KINDS,
  ARTIFACT_STATUSES,
  MANUAL_ARTIFACT_STATUSES,
  SUBJECT_TYPES,
  EXPIRING_SOON_DAYS,
} from './domain/types';
export type {
  ArtifactKind,
  ArtifactStatus,
  ManualArtifactStatus,
  SubjectType,
  ComplianceArtifactRecord,
  ComplianceListFilters,
  ComplianceListItem,
} from './domain/types';

export { deriveArtifactStatus, resolveArtifactStatus } from './domain/status';

export {
  createComplianceArtifactSchema,
  updateComplianceArtifactSchema,
  archiveComplianceArtifactSchema,
  listComplianceArtifactsSchema,
  STATUS_MODE_VALUES,
} from './validation/schemas';
export type {
  CreateComplianceArtifactInput,
  UpdateComplianceArtifactInput,
} from './validation/schemas';
