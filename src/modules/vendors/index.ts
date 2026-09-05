/** Public API of the vendors module. */
export { createVendor } from './application/create-vendor';
export type { CreateVendorResult } from './application/create-vendor';
export { updateVendor } from './application/update-vendor';
export { archiveVendor, restoreVendor } from './application/archive-vendor';
export { listVendorsForOrg, getVendorById } from './application/list-vendors';
export { getVendorPerformance } from './application/get-vendor-performance';
export {
  SUPPLIER_SCORE_FORMULA,
  buildSupplierPerformance,
  averageAvailableScores,
} from './domain/supplier-performance';
export type { SupplierPerformance, SupplierScoreComponent } from './domain/supplier-performance';
export {
  createVendorContact,
  updateVendorContact,
  removeVendorContact,
} from './application/manage-contacts';
export {
  createVendorEngagement,
  endVendorEngagement,
  cancelVendorEngagement,
  archiveVendorEngagement,
  listProjectVendorEngagements,
  listProjectVendorEngagementHistory,
  listVendorEngagements,
  listVendorEngagementHistory,
} from './application/manage-engagements';
export {
  promoteVendorFromTransaction,
} from './application/promote-vendor-from-transaction';
export type { PromoteVendorFromTransactionResult } from './application/promote-vendor-from-transaction';
export {
  createSubcontract,
  updateSubcontract,
  changeSubcontractStatus,
  addApprovedSubcontractChange,
  getSubcontractById,
  listVendorSubcontracts,
  listProjectSubcontracts,
  listOrgSubcontracts,
  listSubcontractParentContracts,
  listSubcontractDocumentCandidates,
  linkSubcontractDocument,
} from './application/subcontracts';
export {
  listSubcontractAdvancesForAgreement,
  getSubcontractAdvanceOutstanding,
  recordSubcontractAdvance,
} from './application/manage-advances';
export {
  listSubcontractAdvances,
  createSubcontractAdvance,
  getAdvanceOutstandingBalance,
} from './data/subcontract-advances.repository';
export {
  upsertVendorPartyIdentifier,
  removeVendorPartyIdentifier,
} from './application/manage-identifiers';
export {
  listCatalogLinksForVendor,
  setVendorCatalogLinks,
} from './application/manage-catalog-links';

export {
  SUBCONTRACT_STATUSES,
  SUBCONTRACT_VALUE_EVENT_KINDS,
  SUBCONTRACT_CHANGE_DIRECTIONS,
} from './domain/subcontract-types';
export type {
  SubcontractStatus,
  SubcontractAgreementRecord,
  SubcontractValueEventRecord,
  SubcontractListItem,
  SubcontractDetail,
  SubcontractParentContractOption,
  SubcontractLinkedDocument,
} from './domain/subcontract-types';
export {
  SUBCONTRACT_ADVANCE_STATUSES,
  computeAdvanceOutstandingBalance,
  foldAdvanceCashIntoPaid,
} from './domain/subcontract-advances';
export type {
  SubcontractAdvanceStatus,
  SubcontractAdvanceRecord,
  SubcontractAdvancePosition,
  CreateSubcontractAdvanceInput,
} from './domain/subcontract-advances';
export {
  VENDOR_TYPES,
  VENDOR_STATUSES,
  CONTACT_ROLES,
  ENGAGEMENT_STATUSES,
  VENDOR_IDENTIFIER_TYPES,
  VENDOR_CATALOG_LINK_KINDS,
} from './domain/types';
export type {
  VendorType,
  VendorStatus,
  VendorRecord,
  VendorListItem,
  VendorDetail,
  VendorContactRecord,
  VendorEngagementRecord,
  VendorEngagementSummary,
  ProjectVendorEngagementSummary,
  EngagementStatus,
  ContactRole,
  VendorIdentifierRecord,
  VendorIdentifierType,
  VendorCatalogLinkRecord,
  VendorCatalogLinkKind,
} from './domain/types';

export { normalizeVendorName, vendorNamesMatch } from './domain/name-matching';
export {
  buildVendorArchivePatch,
  buildVendorRestorePatch,
  isVendorSoftArchived,
} from './domain/soft-archive';

export {
  createVendorSchema,
  updateVendorSchema,
  archiveVendorSchema,
  restoreVendorSchema,
  createContactSchema,
  createEngagementSchema,
  endEngagementSchema,
  cancelEngagementSchema,
  archiveEngagementSchema,
  promoteVendorFromTransactionSchema,
  createSubcontractSchema,
  updateSubcontractSchema,
  changeSubcontractStatusSchema,
  addSubcontractValueChangeSchema,
  linkSubcontractDocumentSchema,
  createSubcontractAdvanceSchema,
  listOrgSubcontractsSchema,
  upsertVendorIdentifierSchema,
  deleteVendorIdentifierSchema,
} from './validation/schemas';
export type {
  PromoteVendorFromTransactionInput,
  CreateVendorInput,
  UpdateVendorInput,
  CreateEngagementInput,
  EndEngagementInput,
  CancelEngagementInput,
  CreateSubcontractInput,
  UpdateSubcontractInput,
  ChangeSubcontractStatusInput,
  AddSubcontractValueChangeInput,
  LinkSubcontractDocumentInput,
  CreateSubcontractAdvanceFormInput,
  ListOrgSubcontractsInput,
} from './validation/schemas';

/** Cross-module org-scoped vendor FK guard. */
export {
  findVendorById,
  findVendorEngagementById,
  findActiveEngagementForVendorProject,
} from './data/vendors.repository';
export { findSubcontractAgreementById } from './data/subcontracts.repository';
export { sumPaidSubcontractAdvancesInDateRange } from './data/subcontract-advances.repository';
