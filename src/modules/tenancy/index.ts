/** Public API of the tenancy module (doc 76 §3). */
export { createOrganization } from './application/create-organization';
export type { CreateOrganizationResult } from './application/create-organization';
export { resolveOrgContext } from './application/resolve-org-context';
export { updateOrganizationProfile } from './application/update-organization';
export type { OrganizationProfile } from './application/update-organization';
export { listOrganizationMembers, removeMemberAccess } from './application/members';
export type { OrganizationMember } from './application/members';
export {
  createInvitation,
  acceptInvitation,
  getInvitationPreview,
  revokeInvitation,
  listPendingInvitations,
} from './application/invitations';
export type {
  CreateInvitationResult,
  InvitationPreview,
  PendingInvitation,
} from './application/invitations';
export {
  getModuleVisibility,
  setModuleVisibility,
  noteModuleUsage,
  resolveModuleVisibility,
} from './application/module-visibility';
export type { ModuleVisibility } from './application/module-visibility';
export {
  listMembershipsForUser,
  findActiveMembership,
  findOrganizationById,
} from './data/organizations.repository';
export { OPTIONAL_MODULE_KEYS, isOptionalModuleKey } from './domain/types';
export type { OptionalModuleKey } from './domain/types';
export { DEFAULT_COST_CATEGORIES, defaultsForCountry } from './domain/organization-defaults';
export {
  createOrganizationSchema,
  updateOrganizationSchema,
  inviteMemberSchema,
  acceptInvitationSchema,
} from './validation/schemas';
