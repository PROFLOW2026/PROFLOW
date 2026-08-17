import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility, OptionalModuleKey } from '@/modules/tenancy/domain/types';
import type { WorkMix } from '@/modules/tenancy/domain/work-mix';
import {
  workMixJobsPrimary,
  workMixProjectsPrimary,
  workMixSurfacesJobs,
} from '@/modules/tenancy/domain/work-mix';

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
] as const;

export type NavIconKey = (typeof NAV_ICON_KEYS)[number];

/** Overflow / sidebar section for non-core destinations. */
export type MoreNavGroup = 'business' | 'operations' | 'advanced';

export const MORE_GROUP_ORDER: readonly MoreNavGroup[] = [
  'business',
  'operations',
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
    moreGroup: 'operations',
  },
  {
    key: 'workforce',
    // Always discoverable when the viewer can read workforce - do not hide
    // behind adaptive module prefs (chicken/egg: first employee cannot be
    // created if Owners never see Employees in More).
    href: '/workforce/employees',
    labelKey: 'workforce',
    iconKey: 'workforce',
    permission: PERMISSIONS.WORKFORCE_READ,
    moreGroup: 'operations',
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
    moreGroup: 'operations',
  },
  {
    key: 'attendance',
    // Permission-only (read | self | manage). No global planning / aging here.
    href: '/workforce/attendance',
    labelKey: 'attendance',
    iconKey: 'attendance',
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_SELF,
      PERMISSIONS.ATTENDANCE_MANAGE,
    ],
    moreGroup: 'operations',
  },
  {
    key: 'timesheets',
    href: '/workforce/time/approvals',
    labelKey: 'timesheets',
    iconKey: 'timesheets',
    permission: PERMISSIONS.TIME_APPROVE,
    moreGroup: 'operations',
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
    key: 'procurement',
    href: '/procurement',
    labelKey: 'procurement',
    iconKey: 'procurement',
    permission: PERMISSIONS.PROCUREMENT_READ,
    module: 'procurement',
    moreGroup: 'operations',
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
    moreGroup: 'operations',
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
  },
];

export interface VisibleNavOptions {
  readonly workMix?: WorkMix;
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
      return { ...item, primaryOnMobile: false, moreGroup: 'business' as const };
    }
    if (item.key === 'jobs') {
      if (jobsPrimary) {
        return { ...item, primaryOnMobile: true, moreGroup: undefined };
      }
      return { ...item, primaryOnMobile: false, moreGroup: 'business' as const };
    }
    return { ...item };
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

  return applyWorkMixToNavItems(filtered, workMix).map((item) => {
    if (item.key === 'vendorBills' && modules.procurement) {
      return { ...item, moreGroup: 'operations' as const };
    }
    return item;
  });
}

export interface NavItemGroup {
  readonly group: MoreNavGroup;
  readonly items: NavItem[];
}

/**
 * Partitions visible nav for sidebar / More sheet:
 * core (no moreGroup, not settings) → business/operations/advanced → settings last.
 */
export function partitionNavItems(items: readonly NavItem[]): {
  core: NavItem[];
  groups: NavItemGroup[];
  settings: NavItem[];
} {
  const settings = items.filter((item) => item.key === 'settings');
  const core = items.filter((item) => !item.moreGroup && item.key !== 'settings');
  const groups = MORE_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.moreGroup === group),
  })).filter((entry) => entry.items.length > 0);

  return { core, groups, settings };
}

/**
 * Mobile bottom bar: at most four destinations. Today stays in that set
 * whenever the user can see it, immediately after Dashboard.
 */
export function selectMobilePrimaryItems(items: readonly NavItem[]): NavItem[] {
  const preferred = items.filter((item) => item.primaryOnMobile);
  const today = preferred.find((item) => item.key === 'today');
  if (!today) return preferred.slice(0, 4);

  const dashboard = preferred.find((item) => item.key === 'dashboard');
  const expenses = preferred.find((item) => item.key === 'expenses');
  const projects = preferred.find((item) => item.key === 'projects');
  const jobs = preferred.find((item) => item.key === 'jobs');
  const work = projects ?? jobs;

  const pinned: NavItem[] = [];
  const used = new Set<string>();
  for (const item of [dashboard, today, work, expenses]) {
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
  const normalized = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?(?=\/|$)/, '') || '/';
  return normalized.split('/').some((segment) => segment === 'new' || segment === 'edit');
}
