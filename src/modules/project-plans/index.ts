import './register-ports';

/**
 * Project plans (Track IJ): drawings register, revisions (publish Rev N supersedes the current one,
 * which stays as history), distribution list, contractor visibility + acknowledgement, and contractor
 * document sharing (metadata over existing `documents`, never file copies).
 *
 * Internal use-cases take an `OrgContext` (project capabilities `documents.view` / `documents.share`);
 * contractor use-cases take an `ExternalContext` (`ext.plan.view`, `ext.plan.acknowledge`,
 * `ext.document.view`). Track R composes `getContractorPlansPortalSummary` into the portal dashboard.
 */

export * from './domain/types';
export {
  acknowledgementPending,
  contractorCanSeeDrawing,
  isPublished,
  nextRevisionSequence,
  normalizeRevisionLabel,
  planRevisionPublish,
  suggestNextRevisionLabel,
  type PublishPlan,
  type PublishRejection,
  type RevisionState,
} from './domain/revisions';
export {
  diffDistribution,
  distributionKey,
  normalizeShareNote,
  normalizeShareTarget,
  normalizeShareTitle,
  type ShareTarget,
} from './domain/sharing';
export {
  DRAWING_REVISION_UPLOAD_PATH,
  addDrawingRevisionFromDocument,
  archiveDrawing,
  beginDrawingRevisionUpload,
  completeDrawingRevisionUpload,
  createDrawing,
  publishDrawingRevision,
  setDrawingDistribution,
  updateDrawing,
  withdrawDrawingRevision,
} from './application/manage-drawings';
export {
  getDrawingDetail,
  listProjectDrawings,
  openInternalRevisionFile,
  type DrawingDetail,
  type DrawingRevisionWithAcks,
  type DrawingsRegister,
} from './application/drawing-queries';
export {
  loadProjectSharingPanel,
  revokeDocumentShare,
  shareDocumentWithContractors,
  type ProjectSharingPanelData,
} from './application/document-sharing';
export {
  acknowledgeDrawingRevision,
  acknowledgeSharedDocument,
  getContractorDrawing,
  getContractorPlansPortalSummary,
  listContractorPlans,
  listContractorSharedDocuments,
  openExternalRevisionFile,
  openExternalSharedDocumentFile,
  type ContractorDrawingDetail,
  type ContractorPlanItem,
  type ContractorPlansPortalSummary,
  type ContractorSharedDocument,
} from './application/contractor-plans';
export type { ShareableDocument } from './data/audience.repository';
export { listDistribution } from './data/plans.repository';
export { listDocumentSharesForProject } from './data/shares.repository';
