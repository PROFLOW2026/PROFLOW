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
  getCapabilityCustomizationModeForOrg,
  setModuleVisibility,
  noteModuleUsage,
  enableAllCustomerCapabilities,
  resetCapabilitiesToBusinessProfile,
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
export {
  PROJECT_EXPERIENCE_PROFILE_KEYS,
  PROJECT_PROFILE_TAB_ALLOWLIST,
  isProjectExperienceProfileKey,
  resolveProjectExperienceProfile,
  projectProfileAllowsTab,
} from './domain/project-profiles';
export type {
  ProjectExperienceProfileKey,
  ProjectTabCapability,
  DeriveProjectProfileInput,
} from './domain/project-profiles';
export { getWorkMixForOrg, saveWorkMix } from './application/work-mix';
export { loadShellOrgSettings, type ShellOrgSettings } from './application/shell-org-settings';
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
export type { ApplyBusinessProfileOptions } from './application/apply-business-profile';
export {
  backfillExistingOrgBusinessCatalogs,
  ensureOrgBusinessCatalogDefaults,
} from './application/backfill-business-catalogs';
export {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from './data/organization-settings.repository';
export { seedBusinessProfileSetup } from './application/seed-business-profile-setup';
export { applyOrganizationProfessionPreset } from './application/apply-organization-profession-preset';
export { applyOrganizationBusinessProfile } from './application/apply-organization-business-profile';
export {
  readExperiencePreviewCookie,
  setExperiencePreviewAction,
} from './application/experience-preview';
export {
  CAPABILITY_REGISTRY,
  CAPABILITY_GROUP_ORDER,
  getCapability,
  listCustomerCapabilities,
  listCapabilitiesByGroup,
  requiredFoundationsFor,
  assertCapabilityRegistryComplete,
} from './domain/capability-registry';
export type { CapabilityGroup, CapabilityDefinition } from './domain/capability-registry';
export {
  EXPERIENCE_PREVIEW_COOKIE,
  EXPERIENCE_PREVIEW_PROFILE_KEYS,
  isExperiencePreviewProfileKey,
  parseExperiencePreviewSelection,
  resolveExperiencePreview,
  isExperiencePreviewEnvironment,
  canUseExperiencePreview,
} from './domain/experience-preview';
export type {
  ExperiencePreviewProfileKey,
  ExperiencePreviewSelection,
  ExperiencePreviewResolved,
} from './domain/experience-preview';
export {
  CAPABILITY_MODE_SETTING_KEY,
  CAPABILITY_CUSTOMIZATION_MODES,
  parseCapabilityCustomizationMode,
  modulePreferenceWritesForProfile,
} from './domain/capability-overrides';
export type {
  CapabilityCustomizationMode,
  ApplyModulePreferenceMode,
} from './domain/capability-overrides';
export {
  ONBOARDING_BUSINESS_TYPES,
  ONBOARDING_WORK_STYLES,
  ONBOARDING_MANAGE_OPTIONS,
  ONBOARDING_PATHS,
  isOnboardingBusinessType,
  isOnboardingWorkStyle,
  isOnboardingManageOption,
  isOnboardingPath,
  workMixForOnboardingStyle,
  modulesForManageOptions,
  resolveOnboardingProfileKey,
} from './domain/onboarding-experience';
export type {
  OnboardingBusinessType,
  OnboardingWorkStyle,
  OnboardingManageOption,
  OnboardingPath,
} from './domain/onboarding-experience';
export {
  todayEmphasisUrgencyBump,
  preferredDashboardCards,
} from './domain/experience-presentation';
export type { DashboardCardKey } from './domain/experience-presentation';
export {
  EXPERIENCE_PERSONA_KEYS,
  personaForBusinessProfile,
  resolveExperienceRoleSurface,
} from './domain/experience-persona';
export type {
  ExperiencePersonaKey,
  ExperienceRoleSurface,
} from './domain/experience-persona';
export {
  EXPERIENCE_COMPLEXITY_KEYS,
  EXPERIENCE_COMPLEXITY_SETTING_KEY,
  isExperienceComplexityKey,
  parseExperienceComplexity,
  filterModulesByComplexity,
  applyComplexityToVisibility,
} from './domain/experience-complexity';
export type { ExperienceComplexityKey } from './domain/experience-complexity';
export {
  EXPERIENCE_NAV_GROUPS,
  NAV_KEY_TO_EXPERIENCE_GROUP,
  PERSONA_PRIMARY_NAV_KEYS,
  PERSONA_VISIBLE_GROUPS,
  roleNavEmphasis,
} from './domain/experience-nav-layout';
export type { ExperienceNavGroup } from './domain/experience-nav-layout';
export {
  PERSONA_DASHBOARD_CARDS,
  dashboardCardsForPersona,
} from './domain/experience-dashboard';
export type { ExperienceDashboardCard } from './domain/experience-dashboard';
export {
  todayCategoryForSource,
  PERSONA_TODAY_FOCUS,
  PERSONA_TODAY_DEEMPHASIZE,
  todayUrgencyBumpForPersona,
  todayItemVisibleForPersona,
} from './domain/experience-today';
export type { TodayFocusCategory } from './domain/experience-today';
export {
  PERSONA_QUICK_CREATE_KEYS,
  limitQuickCreateForPersona,
} from './domain/experience-quick-create';
export {
  getExperienceComplexityForOrg,
  saveExperienceComplexity,
} from './application/experience-complexity';
export {
  UNUSED_CAPABILITY_DISMISSALS_SETTING_KEY,
  UNUSED_CAPABILITY_NEVER_SUGGEST,
  UNUSED_CAPABILITY_PRIORITY,
  UNUSED_CAPABILITY_STALE_DAYS,
  DISCOVERABILITY_TIP_KEYS,
  parseUnusedCapabilityDismissals,
  suggestUnusedCapabilities,
  listDiscoverabilityTipKeys,
} from './domain/unused-capability-suggestions';
export type {
  ModulePreferenceForSuggestion,
  DiscoverabilityTipKey,
} from './domain/unused-capability-suggestions';
export {
  getUnusedCapabilityDismissals,
  dismissUnusedCapabilitySuggestion,
} from './application/unused-capability-dismissals';
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
  saveOrgWorkFrameworkHours,
} from './application/labor-cost-defaults';
export type { LaborCostDefaults, LaborCostDefaultComponent } from './domain/labor-cost-defaults';
export {
  LABOR_COST_DEFAULTS_SETTING_KEY,
  parseLaborCostDefaults,
} from './domain/labor-cost-defaults';
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
