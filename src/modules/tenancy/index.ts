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
} from './application/module-visibility';
export {
  listMembershipsForUser,
  findActiveMembership,
  findOrganizationById,
} from './data/organizations.repository';
export {
  OPTIONAL_MODULE_KEYS,
  CUSTOMER_FEATURE_MODULE_KEYS,
  isOptionalModuleKey,
  parseModuleVisibilityMode,
  resolveModuleVisibility,
} from './domain/types';
export type { OptionalModuleKey, ModuleVisibility } from './domain/types';
export {
  WORK_MIX_SETTING_KEY,
  WORK_MIXES,
  DEFAULT_WORK_MIX,
  isWorkMix,
  parseWorkMix,
  workMixSurfacesJobs,
  workMixProjectsPrimary,
  workMixJobsPrimary,
} from './domain/work-mix';
export type { WorkMix } from './domain/work-mix';
export { getWorkMixForOrg, saveWorkMix } from './application/work-mix';
export { DEFAULT_COST_CATEGORIES, defaultsForCountry } from './domain/organization-defaults';
export {
  PROFESSION_PRESET_KEYS,
  PROFESSION_PRESETS,
  getProfessionPreset,
} from './domain/profession-presets';
export type { ProfessionPresetKey, ProfessionPreset } from './domain/profession-presets';
export {
  BUSINESS_PROFILE_KEYS,
  BUSINESS_PROFILES,
  BUSINESS_PROFILE_SETTING_KEY,
  TERMINOLOGY_SETTING_KEY,
  QUICK_CREATE_EMPHASIS_SETTING_KEY,
  SUGGESTED_DEFAULTS_SETTING_KEY,
  getBusinessProfile,
  isBusinessProfileKey,
  resolveBusinessProfileKey,
  parseTerminology,
  parseQuickCreateEmphasis,
  parseSuggestedDefaults,
  terminologyLabel,
  LEGACY_PROFESSION_TO_BUSINESS_PROFILE,
} from './domain/business-profiles';
export type {
  BusinessProfileKey,
  BusinessProfile,
  WorkTerminologyLabels,
  QuickCreateEmphasisKey,
  SuggestedBusinessDefaults,
} from './domain/business-profiles';
export {
  TODAY_EMPHASIS_SETTING_KEY,
  getBusinessProfileSetup,
  parseTodayEmphasis,
} from './domain/business-profile-setup';
export type {
  BusinessProfileSetupSuggestions,
  TodayEmphasis,
} from './domain/business-profile-setup';
export {
  applyProfessionPreset,
  suggestedWorkPackageNames,
} from './application/apply-profession-preset';
export {
  applyBusinessProfileConfig,
  getBusinessProfileKeyForOrg,
  getTerminologyForOrg,
  getQuickCreateEmphasisForOrg,
  getSuggestedDefaultsForOrg,
  orderQuickCreateActions,
} from './application/apply-business-profile';
export { seedBusinessProfileSetup } from './application/seed-business-profile-setup';
export { applyOrganizationProfessionPreset } from './application/apply-organization-profession-preset';
export { applyOrganizationBusinessProfile } from './application/apply-organization-business-profile';
export {
  listOrganizationServiceDomains,
  listOrganizationDocumentTypes,
  listEnabledServiceDomainsForPicker,
  listEnabledDocumentTypesForPicker,
  createServiceDomain,
  createDocumentType,
  renameCatalogItem,
  setCatalogItemEnabled,
  archiveCatalogItem,
} from './application/organization-catalog';
export {
  getOrgStructureTemplatesBag,
  listOrgProjectTemplatesForApply,
  getOrgProjectTemplateById,
  listOrgPhasePacks,
  listOrgWorkPackagePacks,
  upsertOrgProjectTemplate,
  deleteOrgProjectTemplate,
  upsertOrgPhasePack,
  deleteOrgPhasePack,
  upsertOrgWorkPackagePack,
  deleteOrgWorkPackagePack,
  parseWorkPackageLines,
  parseMilestoneLines,
  previewOrgStructureTemplate,
} from './application/org-structure-templates';
export type {
  OrgStructureTemplate,
  OrgPhasePack,
  OrgWorkPackagePack,
  OrgStructureTemplatesBag,
  OrgStructureTemplatePreview,
} from './domain/org-structure-templates';
export {
  getLaborCostDefaults,
  getLaborCostDefaultsForApply,
  saveLaborCostDefaults,
} from './application/labor-cost-defaults';
export type { LaborCostDefaults, LaborCostDefaultComponent } from './domain/labor-cost-defaults';
export type { OrganizationDomainRow } from './domain/organization-domains';
export {
  getOrganizationLegalIdentity,
  getOrganizationTaxId,
  saveOrganizationLegalIdentity,
  updateOrganizationLegalIdentity,
} from './application/legal-identity';
export {
  parseOrganizationLegalIdentity,
  resolveOrganizationTaxId,
  LEGAL_IDENTITY_SETTING_KEY,
} from './domain/legal-identity';
export type { OrganizationLegalIdentity } from './domain/legal-identity';
export {
  createOrganizationSchema,
  updateOrganizationSchema,
  inviteMemberSchema,
  acceptInvitationSchema,
} from './validation/schemas';

export {
  allocateDocumentNumber,
  resolveAllocatedReference,
  listDocumentNumberSettings,
  saveDocumentNumberSettings,
} from './application/document-numbers';
export {
  DOCUMENT_NUMBER_KINDS,
  ALLOCATED_DOCUMENT_NUMBER_KINDS,
  suppliedDocumentReference,
  titleWithDocumentNumber,
  isDocumentNumberKind,
  documentKindForWorkKind,
  defaultDocumentNumberSequence,
} from './domain/document-numbers';
export type {
  DocumentNumberKind,
  AllocatedDocumentNumberKind,
  DocumentNumberSequenceRecord,
} from './domain/document-numbers';
export {
  saveDocumentNumberSequencesSchema,
  documentNumberSequenceInputSchema,
} from './validation/document-numbers';
export {
  SAVED_LIST_KEYS,
  compactSearchQuery,
  queriesMatch,
  isSavedListKey,
} from './domain/saved-list-views';
export type { SavedListKey, SavedListViewRecord } from './domain/saved-list-views';
export {
  listSavedListViews,
  saveSavedListView,
  deleteSavedListView,
} from './application/saved-list-views';
