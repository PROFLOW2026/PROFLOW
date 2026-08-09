/** Public API of the vendors module. */
export { createVendor } from './application/create-vendor';
export type { CreateVendorResult } from './application/create-vendor';
export { updateVendor } from './application/update-vendor';
export { archiveVendor } from './application/archive-vendor';
export { listVendorsForOrg, getVendorById } from './application/list-vendors';
export {
  createVendorContact,
  updateVendorContact,
  removeVendorContact,
  createVendorEngagement,
  archiveVendorEngagement,
} from './application/manage-contacts';
export {
  promoteVendorFromTransaction,
} from './application/promote-vendor-from-transaction';
export type { PromoteVendorFromTransactionResult } from './application/promote-vendor-from-transaction';

export { VENDOR_TYPES, VENDOR_STATUSES, CONTACT_ROLES } from './domain/types';
export type {
  VendorType,
  VendorStatus,
  VendorRecord,
  VendorListItem,
  VendorDetail,
  VendorContactRecord,
  VendorEngagementRecord,
  ContactRole,
} from './domain/types';

export { normalizeVendorName, vendorNamesMatch } from './domain/name-matching';

export {
  createVendorSchema,
  updateVendorSchema,
  archiveVendorSchema,
  createContactSchema,
  createEngagementSchema,
  promoteVendorFromTransactionSchema,
} from './validation/schemas';
export type { PromoteVendorFromTransactionInput, CreateVendorInput, UpdateVendorInput } from './validation/schemas';
