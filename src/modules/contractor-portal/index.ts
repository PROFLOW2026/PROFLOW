/**
 * Contractor portal shell (Track R). Domain tracks implement `PortalSectionProvider` /
 * `PortalNotificationSource` against their own portal summary queries; the registry in
 * `application/registry.ts` composes them. Server-only loaders live in
 * `application/load-portal-session.ts` (not re-exported, so this entry stays client-safe).
 */

export {
  holdsRequirement,
  requirementCapabilities,
  type PortalCapabilityRequirement,
} from './domain/capability-requirement';
export {
  PORTAL_BASE_PATH,
  PORTAL_ROUTES,
  PORTAL_SIGN_IN_PATH,
  buildPortalHref,
  isLivePortalHref,
  matchPortalRoute,
  portalHref,
  portalRoute,
  projectHomeHref,
  type PortalNavPlacement,
  type PortalRouteDefinition,
  type PortalRouteKey,
  type PortalRouteParams,
  type PortalRouteScope,
} from './domain/routes';
export {
  activePortalNavKey,
  buildPortalMobileNav,
  buildPortalPrimaryNav,
  buildPortalProjectNav,
  projectIdFromPortalPath,
  splitBottomNav,
  type PortalNavItem,
} from './domain/nav';
export {
  activeContractorMobileTab,
  buildContractorMobileNavItems,
  CONTRACTOR_MOBILE_TABS,
  PORTAL_TODAY_SECTION_IDS,
  PORTAL_PROJECT_HOME_SECTION_EXCLUDE,
  type ContractorMobileTabKey,
} from './domain/mobile-tabs';
export {
  findPortalProject,
  resolvePortalProjects,
  type PortalDirectoryRow,
  type PortalProjectAccess,
  type PortalVendorRef,
} from './domain/project-access';
export {
  PORTAL_SECTIONS,
  PORTAL_SECTION_IDS,
  PORTAL_SECTION_ITEM_LIMIT,
  mergeSectionResults,
  planPortalSections,
  targetFor,
  type ComposedPortalSection,
  type PortalItemTone,
  type PortalProjectTarget,
  type PortalSectionDefinition,
  type PortalSectionId,
  type PortalSectionItem,
  type PortalSectionMetric,
  type PortalSectionProvider,
  type PortalSectionScope,
  type PortalSectionSummary,
} from './domain/sections';
export type {
  PortalNotificationItem,
  PortalNotificationPage,
  PortalNotificationSource,
} from './domain/notifications';
