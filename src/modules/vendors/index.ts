/** Public API of the vendors module. */
export { createVendor } from './application/create-vendor';
export type { CreateVendorResult } from './application/create-vendor';
export { updateVendor } from './application/update-vendor';
export { archiveVendor, restoreVendor } from './application/archive-vendor';
export { listVendorsForOrg, getVendorById } from './application/list-vendors';
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
  listSubcontractParentContracts,
  listSubcontractDocumentCandidates,
  linkSubcontractDocument,
} from './application/subcontracts';

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
export { VENDOR_TYPES, VENDOR_STATUSES, CONTACT_ROLES, ENGAGEMENT_STATUSES } from './domain/types';
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
} from './validation/schemas';

/** Cross-module org-scoped vendor FK guard. */
export { findVendorById, findVendorEngagementById } from './data/vendors.repository';
