import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility, OptionalModuleKey } from '@/modules/tenancy/domain/types';
import type { WorkMix } from '@/modules/tenancy/domain/work-mix';
import {
  workMixJobsPrimary,
  workMixProjectsPrimary,
  workMixSurfacesJobs,
} from '@/modules/tenancy/domain/work-mix';
import type {
  ExperiencePersonaKey,
  ExperienceRoleSurface,
} from '@/modules/tenancy/domain/experience-persona';
import type { ExperienceComplexityKey } from '@/modules/tenancy/domain/experience-complexity';
import { filterNavKeysByComplexity } from '@/modules/tenancy/domain/experience-complexity';
import {
  NAV_KEY_TO_EXPERIENCE_GROUP,
  PERSONA_PRIMARY_NAV_KEYS,
  PERSONA_VISIBLE_GROUPS,
  roleNavEmphasis,
} from '@/modules/tenancy/domain/experience-nav-layout';

/**
 * Adaptive navigation model (docs 40 §4, 41, 48 U1).
 *
 * Home, Projects, Expenses and Settings are always present. Everything else
 * appears only once the organization turns it on or starts using it, so a
 * one-person business never sees chrome for capabilities it does not have.
 *
 * Jobs share the projects domain but are a separate destination. Org
 * `work_mix` adjusts which of Projects / Jobs dominates mobile chrome.
 *
 * Icons are referenced by key so nav items stay serializable across the
 * server/client boundary - Lucide components cannot be passed as props.
 */

export const NAV_ICON_KEYS = [
  'dashboard',
  'today',
  'projects',
  'jobs',
  'expenses',
  'billing',
  'recurringDrafts',
  'changes',
  'clients',
  'vendors',
  'workforce',
  'attendance',
  'time',
  'documents',
  'crm',
  'quotes',
  'contracts',
  'subcontracts',
  'compliance',
  'procurement',
  'materials',
  'fieldOps',
  'safety',
  'assets',
  'reports',
  'approvals',
  'timesheets',
  'monthClose',
  'service',
  'forms',
  'scheduling',
  'imports',
  'settings',
  'cashFlow',
  'calendar',
  'warranty',
  'communications',
  'assistant',
  'automations',
  'fieldHome',
] as const;

export type NavIconKey = (typeof NAV_ICON_KEYS)[number];

/** Overflow / sidebar section for non-core destinations — experience groups. */
export type MoreNavGroup =
  | 'clients'
  | 'work'
  | 'people'
  | 'purchasing'
  | 'money'
  | 'field'
  | 'documents'
  | 'reports'
  | 'advanced'
  /** @deprecated legacy aliases kept for tests during transition */
  | 'business'
  | 'operations';

export const MORE_GROUP_ORDER: readonly MoreNavGroup[] = [
  'clients',
  'work',
  'people',
  'purchasing',
  'money',
  'field',
  'documents',
  'reports',
  'advanced',
] as const;

export interface NavItem {
  key: string;
  href: string;
  labelKey: string;
  iconKey: NavIconKey;
  /** Hidden entirely when the viewer lacks this permission. */
  permission?: PermissionKey;
  /**
   * Hidden unless the viewer has at least one of these (OR).
   * When set, takes precedence over `permission`.
   */
  anyPermissions?: readonly PermissionKey[];
  /** `undefined` means always visible. */
  module?: OptionalModuleKey;
  /** Shown in the mobile bottom bar rather than behind "More". */
  primaryOnMobile?: boolean;
  /**
   * More-menu / sidebar section. Core (dashboard, projects, expenses) and
   * settings omit this - they render ungrouped / last respectively.
   */
  moreGroup?: MoreNavGroup;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: 'dashboard',
    href: '/',
    labelKey: 'dashboard',
    iconKey: 'dashboard',
    primaryOnMobile: true,
  },
  {
    key: 'today',
    href: '/today',
    labelKey: 'today',
    iconKey: 'today',
    permission: PERMISSIONS.COMMAND_CENTER_READ,
    /** Core destination for eligible users - not an optional module. */
    primaryOnMobile: true,
  },
  {
    key: 'projects',
    href: '/projects',
    labelKey: 'projects',
    iconKey: 'projects',
    permission: PERMISSIONS.PROJECTS_READ,
    primaryOnMobile: true,
  },
  {
    key: 'jobs',
    href: '/jobs',
    labelKey: 'jobs',
    iconKey: 'jobs',
    permission: PERMISSIONS.PROJECTS_READ,
    module: 'jobs',
  },
  {
    key: 'workOrders',
    href: '/work-orders',
    labelKey: 'workOrders',
    iconKey: 'service',
    permission: PERMISSIONS.SERVICE_READ,
    module: 'service',
    moreGroup: 'operations',
  },
  {
    key: 'dispatch',
    href: '/dispatch',
    labelKey: 'dispatch',
    iconKey: 'service',
    anyPermissions: [PERMISSIONS.SERVICE_READ, PERMISSIONS.DISPATCH_MANAGE],
    module: 'service',
    moreGroup: 'operations',
  },
  {
    key: 'expenses',
    href: '/expenses',
    labelKey: 'expenses',
    iconKey: 'expenses',
    permission: PERMISSIONS.EXPENSES_READ,
    primaryOnMobile: true,
  },
  {
    key: 'clients',
    href: '/clients',
    labelKey: 'clients',
    iconKey: 'clients',
    permission: PERMISSIONS.CLIENTS_READ,
    module: 'clients',
    moreGroup: 'business',
  },
  {
    key: 'quotes',
    href: '/quotes',
    labelKey: 'quotes',
    iconKey: 'quotes',
    permission: PERMISSIONS.QUOTES_READ,
    module: 'quotes',
    moreGroup: 'business',
  },
  {
    key: 'contracts',
    href: '/contracts',
    labelKey: 'contracts',
    iconKey: 'contracts',
    permission: PERMISSIONS.CONTRACTS_READ,
    moreGroup: 'business',
  },
  {
    key: 'crm',
    href: '/crm',
    labelKey: 'crm',
    iconKey: 'crm',
    permission: PERMISSIONS.CRM_READ,
    module: 'crm',
    moreGroup: 'business',
  },
  {
    key: 'changes',
    href: '/changes',
    labelKey: 'changes',
    iconKey: 'changes',
    permission: PERMISSIONS.CHANGES_READ,
    module: 'changes',
    moreGroup: 'business',
  },
  {
    key: 'billing',
    href: '/billing',
    labelKey: 'billing',
    iconKey: 'billing',
    permission: PERMISSIONS.BILLING_READ,
    module: 'billing',
    moreGroup: 'business',
  },
  {
    key: 'recurringDrafts',
    href: '/recurring-drafts',
    labelKey: 'recurringDrafts',
    iconKey: 'recurringDrafts',
    anyPermissions: [
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.EXPENSES_CREATE,
      PERMISSIONS.AP_READ,
      PERMISSIONS.AP_MANAGE,
      PERMISSIONS.BILLING_READ,
      PERMISSIONS.BILLING_MANAGE,
    ],
    moreGroup: 'business',
  },
  {
    key: 'reports',
    href: '/reports',
    labelKey: 'reports',
    iconKey: 'reports',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
    moreGroup: 'business',
  },
  {
    key: 'vendors',
    href: '/vendors',
    labelKey: 'vendors',
    iconKey: 'vendors',
    permission: PERMISSIONS.VENDORS_READ,
    module: 'vendors',
    moreGroup: 'purchasing',
  },
  {
    key: 'subcontracts',
    href: '/subcontracts',
    labelKey: 'subcontracts',
    iconKey: 'subcontracts',
    permission: PERMISSIONS.VENDORS_READ,
    module: 'vendors',
    moreGroup: 'purchasing',
  },
  {
    key: 'workforce',
    // People hub — attendance/timesheets stay in workforce sub-nav only.
    href: '/workforce/employees',
    labelKey: 'people',
    iconKey: 'workforce',
    permission: PERMISSIONS.WORKFORCE_READ,
    moreGroup: 'people',
  },
  {
    key: 'time',
    href: '/workforce/time',
    labelKey: 'time',
    iconKey: 'time',
    anyPermissions: [
      PERMISSIONS.TIME_MANAGE,
      PERMISSIONS.TIME_APPROVE,
      PERMISSIONS.WORKFORCE_READ,
    ],
    moreGroup: 'people',
  },
  {
    key: 'scheduling',
    href: '/scheduling',
    labelKey: 'scheduling',
    iconKey: 'scheduling',
    permission: PERMISSIONS.SCHEDULING_READ,
    moreGroup: 'operations',
  },
  {
    key: 'calendar',
    href: '/calendar',
    labelKey: 'calendar',
    iconKey: 'calendar',
    permission: PERMISSIONS.SCHEDULING_READ,
    moreGroup: 'operations',
  },
  {
    key: 'cashFlow',
    href: '/cash-flow',
    labelKey: 'cashFlow',
    iconKey: 'cashFlow',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
    moreGroup: 'business',
  },
  {
    key: 'warranty',
    href: '/warranty',
    labelKey: 'warranty',
    iconKey: 'warranty',
    permission: PERMISSIONS.PROJECTS_READ,
    moreGroup: 'operations',
  },
  {
    key: 'communications',
    href: '/communications',
    labelKey: 'communications',
    iconKey: 'communications',
    permission: PERMISSIONS.COMMUNICATIONS_READ,
    moreGroup: 'business',
  },
  {
    key: 'assistant',
    href: '/assistant',
    labelKey: 'assistant',
    iconKey: 'assistant',
    permission: PERMISSIONS.ASSISTANT_USE,
    moreGroup: 'advanced',
  },
  {
    key: 'automations',
    href: '/automations',
    labelKey: 'automations',
    iconKey: 'automations',
    permission: PERMISSIONS.AUTOMATIONS_READ,
    moreGroup: 'advanced',
  },
  {
    key: 'procurement',
    href: '/procurement',
    labelKey: 'procurement',
    iconKey: 'procurement',
    permission: PERMISSIONS.PROCUREMENT_READ,
    module: 'procurement',
    moreGroup: 'purchasing',
  },
  {
    key: 'procurementRfqs',
    href: '/procurement/rfqs',
    labelKey: 'procurementRfqs',
    iconKey: 'procurement',
    permission: PERMISSIONS.PROCUREMENT_READ,
    module: 'procurement',
    moreGroup: 'purchasing',
  },
  {
    key: 'vendorBills',
    // Permission-only so AP is findable without Procurement. When Procurement
    // is on, visibleNavItems promotes this into Operations next to POs.
    href: '/procurement/ap',
    labelKey: 'vendorBills',
    iconKey: 'procurement',
    permission: PERMISSIONS.AP_READ,
    moreGroup: 'advanced',
  },
  {
    key: 'materials',
    href: '/procurement/materials',
    labelKey: 'materials',
    iconKey: 'materials',
    permission: PERMISSIONS.MATERIALS_READ,
    module: 'materials',
    moreGroup: 'purchasing',
  },
  {
    key: 'fieldOps',
    href: '/field-ops',
    labelKey: 'fieldOps',
    iconKey: 'fieldOps',
    permission: PERMISSIONS.FIELD_OPS_READ,
    module: 'field_ops',
    moreGroup: 'operations',
  },
  {
    key: 'fieldHome',
    href: '/field',
    labelKey: 'fieldHome',
    iconKey: 'fieldOps',
    anyPermissions: [
      PERMISSIONS.FIELD_OPS_READ,
      PERMISSIONS.SERVICE_READ,
      PERMISSIONS.TIME_MANAGE,
      PERMISSIONS.ATTENDANCE_SELF,
    ],
    moreGroup: 'operations',
  },
  {
    key: 'safety',
    href: '/safety',
    labelKey: 'safety',
    iconKey: 'safety',
    permission: PERMISSIONS.SAFETY_READ,
    moreGroup: 'operations',
  },
  {
    key: 'forms',
    href: '/forms',
    labelKey: 'forms',
    iconKey: 'forms',
    permission: PERMISSIONS.FORMS_READ,
    module: 'forms',
    moreGroup: 'operations',
  },
  {
    key: 'serviceRecurring',
    href: '/service/recurring',
    labelKey: 'serviceRecurring',
    iconKey: 'service',
    permission: PERMISSIONS.SERVICE_READ,
    module: 'service',
    moreGroup: 'operations',
  },
  {
    key: 'documents',
    href: '/documents',
    labelKey: 'documents',
    iconKey: 'documents',
    permission: PERMISSIONS.DOCUMENTS_READ,
    module: 'documents',
    moreGroup: 'operations',
  },
  {
    key: 'imports',
    href: '/imports',
    labelKey: 'imports',
    iconKey: 'imports',
    anyPermissions: [
      PERMISSIONS.CLIENTS_MANAGE,
      PERMISSIONS.VENDORS_MANAGE,
      PERMISSIONS.WORKFORCE_MANAGE,
      PERMISSIONS.PROJECTS_CREATE,
      PERMISSIONS.CONTRACTS_MANAGE,
      PERMISSIONS.EXPENSES_CREATE,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.BOQ_MANAGE,
    ],
    moreGroup: 'operations',
  },
  {
    key: 'assets',
    href: '/assets',
    labelKey: 'assets',
    iconKey: 'assets',
    permission: PERMISSIONS.ASSETS_READ,
    module: 'assets',
    moreGroup: 'advanced',
  },
  {
    key: 'compliance',
    href: '/compliance',
    labelKey: 'compliance',
    iconKey: 'compliance',
    permission: PERMISSIONS.COMPLIANCE_READ,
    module: 'compliance',
    moreGroup: 'advanced',
  },
  {
    key: 'approvals',
    href: '/approvals',
    labelKey: 'approvals',
    iconKey: 'approvals',
    permission: PERMISSIONS.APPROVALS_READ,
    module: 'approvals',
    moreGroup: 'advanced',
  },
  {
    key: 'monthClose',
    href: '/month-close',
    labelKey: 'monthClose',
    iconKey: 'monthClose',
    permission: PERMISSIONS.MONTH_CLOSE_READ,
    moreGroup: 'advanced',
  },
  {
    key: 'overhead',
    href: '/overhead',
    labelKey: 'overhead',
    iconKey: 'expenses',
    permission: PERMISSIONS.EXPENSES_READ,
    module: 'overhead',
    moreGroup: 'advanced',
  },
  {
    key: 'settings',
    href: '/settings',
    labelKey: 'settings',
    iconKey: 'settings',
    moreGroup: 'advanced',
  },
];

export interface VisibleNavOptions {
  readonly workMix?: WorkMix;
  readonly persona?: ExperiencePersonaKey;
  readonly roleSurface?: ExperienceRoleSurface;
  readonly complexity?: ExperienceComplexityKey;
}

/**
 * Applies org work mix to Projects / Jobs prominence without inventing a
 * second app shell. Jobs-only orgs keep Projects reachable but not primary.
 */
export function applyWorkMixToNavItems(
  items: readonly NavItem[],
  workMix: WorkMix = 'projects',
): NavItem[] {
  const projectsPrimary = workMixProjectsPrimary(workMix);
  const jobsPrimary = workMixJobsPrimary(workMix);

  return items.map((item) => {
    if (item.key === 'projects') {
      if (projectsPrimary) {
        return { ...item, primaryOnMobile: true, moreGroup: undefined };
      }
      return { ...item, primaryOnMobile: false, moreGroup: 'work' as const };
    }
    if (item.key === 'jobs') {
      if (jobsPrimary) {
        return { ...item, primaryOnMobile: true, moreGroup: undefined };
      }
      return { ...item, primaryOnMobile: false, moreGroup: 'work' as const };
    }
    if (item.key === 'fieldHome') {
      if (jobsPrimary) {
        return { ...item, primaryOnMobile: true, moreGroup: undefined };
      }
      return { ...item, primaryOnMobile: false, moreGroup: 'field' as const };
    }
    return { ...item };
  });
}

/**
 * Recompose navigation into persona groups + primary set.
 * Destination catalog stays NAV_ITEMS; presentation changes here.
 */
export function applyExperienceNavLayout(
  items: readonly NavItem[],
  persona: ExperiencePersonaKey = 'mixed',
  roleSurface: ExperienceRoleSurface = 'general',
): NavItem[] {
  const primaryKeys = PERSONA_PRIMARY_NAV_KEYS[persona];
  const visibleGroups = new Set(PERSONA_VISIBLE_GROUPS[persona]);
  const { prefer, demote } = roleNavEmphasis(roleSurface);
  const preferSet = new Set(prefer);
  const demoteSet = new Set(demote);

  return items.map((item) => {
    if (item.key === 'settings') {
      return { ...item, moreGroup: 'advanced' as const, primaryOnMobile: false };
    }

    const mappedGroup = NAV_KEY_TO_EXPERIENCE_GROUP[item.key] ?? 'advanced';
    let group: MoreNavGroup =
      mappedGroup === 'today' ? ('work' as MoreNavGroup) : (mappedGroup as MoreNavGroup);

    const isPrimary = primaryKeys.includes(item.key) || preferSet.has(item.key);

    if (demoteSet.has(item.key)) {
      group = 'advanced';
    } else if (!visibleGroups.has(mappedGroup) && mappedGroup !== 'today') {
      group = 'advanced';
    }

    if (item.key === 'dashboard') {
      return { ...item, moreGroup: undefined, primaryOnMobile: true };
    }

    if (item.key === 'today') {
      const todayPrimary =
        primaryKeys.includes('today') &&
        !demoteSet.has('today') &&
        persona !== 'project_contractor';
      if (todayPrimary) {
        return { ...item, moreGroup: undefined, primaryOnMobile: true };
      }
      return { ...item, moreGroup: 'work' as const, primaryOnMobile: false };
    }

    if (isPrimary && primaryKeys.indexOf(item.key) >= 0 && primaryKeys.indexOf(item.key) < 4) {
      return { ...item, moreGroup: undefined, primaryOnMobile: true };
    }

    return {
      ...item,
      moreGroup: group,
      primaryOnMobile: false,
    };
  });
}

export function visibleNavItems(
  permissions: ReadonlySet<string>,
  modules: ModuleVisibility,
  options: VisibleNavOptions = {},
): NavItem[] {
  const workMix = options.workMix ?? 'projects';
  const forceJobs = workMixSurfacesJobs(workMix);

  const filtered = NAV_ITEMS.filter((item) => {
    if (item.anyPermissions && item.anyPermissions.length > 0) {
      if (!item.anyPermissions.some((key) => permissions.has(key))) return false;
    } else if (item.permission && !permissions.has(item.permission)) {
      return false;
    }
    if (item.key === 'jobs') {
      if (forceJobs) return true;
      return Boolean(modules.jobs);
    }
    if (item.module && !modules[item.module]) return false;
    return true;
  });

  const withMix = applyWorkMixToNavItems(filtered, workMix).map((item) => {
    if (item.key === 'vendorBills' && modules.procurement) {
      return { ...item, moreGroup: 'purchasing' as const };
    }
    return item;
  });

  return applyExperienceNavLayout(
    withMix,
    options.persona ?? 'mixed',
    options.roleSurface ?? 'general',
  ).filter((item) =>
    filterNavKeysByComplexity([item.key], options.complexity ?? 'full').includes(item.key),
  );
}

export interface NavItemGroup {
  readonly group: MoreNavGroup;
  readonly items: NavItem[];
}

/**
 * Partitions visible nav for sidebar / More sheet:
 * core (no moreGroup) → experience groups (including settings under advanced).
 */
export function partitionNavItems(items: readonly NavItem[]): {
  core: NavItem[];
  groups: NavItemGroup[];
} {
  const core = items.filter((item) => !item.moreGroup);
  const groups = MORE_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.moreGroup === group),
  })).filter((entry) => entry.items.length > 0);

  return { core, groups };
}

/**
 * Mobile bottom bar: at most four destinations.
 * Prefer persona-marked primaryOnMobile items (set by applyExperienceNavLayout).
 * Keep Dashboard then Today first whenever both are available.
 */
export function selectMobilePrimaryItems(items: readonly NavItem[]): NavItem[] {
  const preferred = items.filter((item) => item.primaryOnMobile);
  if (preferred.length === 0) return items.slice(0, 4);

  const pinned: NavItem[] = [];
  const used = new Set<string>();

  const dashboard = preferred.find((item) => item.key === 'dashboard');
  const today = preferred.find((item) => item.key === 'today');
  for (const item of [dashboard, today]) {
    if (!item || used.has(item.key)) continue;
    pinned.push(item);
    used.add(item.key);
  }

  for (const item of preferred) {
    if (pinned.length >= 4) break;
    if (used.has(item.key)) continue;
    pinned.push(item);
    used.add(item.key);
  }

  return pinned.slice(0, 4);
}

export function isNavItemActive(pathname: string, href: string): boolean {
  const normalized = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?(?=\/|$)/, '') || '/';
  if (href === '/') return normalized === '/';
  if (normalized === href) return true;
  if (!normalized.startsWith(`${href}/`)) return false;
  // Prefer a more specific sibling (e.g. `/procurement/materials` over `/procurement`).
  const hasMoreSpecificMatch = NAV_ITEMS.some(
    (item) =>
      item.href !== href &&
      item.href.startsWith(`${href}/`) &&
      (normalized === item.href || normalized.startsWith(`${item.href}/`)),
  );
  return !hasMoreSpecificMatch;
}

/**
 * True on focused create/edit routes where a corner FAB would cover Save/Create.
 * Quick-create stays available as a compact top-bar control instead.
 */
export function isFocusedComposerPath(pathname: string): boolean {
  const normalized = normalizeShellPath(pathname);
  return normalized.split('/').some((segment) => segment === 'new' || segment === 'edit');
}

function normalizeShellPath(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?(?=\/|$)/, '') || '/';
}

/**
 * Hide global quick-create when the surface already exposes a dedicated primary
 * time-entry action (project/job Time tab — "דיווח שעות").
 */
export function shouldHideQuickCreateForRoute(
  pathname: string,
  searchParams: Pick<URLSearchParams, 'get'> | null | undefined,
): boolean {
  const normalized = normalizeShellPath(pathname);
  if (searchParams?.get('tab') !== 'time') return false;
  return /^\/(projects|jobs)\/[^/]+$/.test(normalized);
}
