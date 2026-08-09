import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy';
import type { OptionalModuleKey } from '@/modules/tenancy';

/**
 * Adaptive navigation model (docs 40 §4, 41, 48 U1).
 *
 * Home, Projects, Expenses and Settings are always present. Everything else
 * appears only once the organization turns it on or starts using it, so a
 * one-person business never sees chrome for capabilities it does not have.
 *
 * Icons are referenced by key so nav items stay serializable across the
 * server/client boundary — Lucide components cannot be passed as props.
 */

export const NAV_ICON_KEYS = [
  'dashboard',
  'projects',
  'expenses',
  'billing',
  'changes',
  'clients',
  'vendors',
  'workforce',
  'documents',
  'crm',
  'compliance',
  'procurement',
  'materials',
  'fieldOps',
  'assets',
  'reports',
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
  /** `undefined` means always visible. */
  module?: OptionalModuleKey;
  /** Shown in the mobile bottom bar rather than behind "More". */
  primaryOnMobile?: boolean;
  /**
   * More-menu / sidebar section. Core (dashboard, projects, expenses) and
   * settings omit this — they render ungrouped / last respectively.
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
    key: 'projects',
    href: '/projects',
    labelKey: 'projects',
    iconKey: 'projects',
    permission: PERMISSIONS.PROJECTS_READ,
    primaryOnMobile: true,
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
    key: 'reports',
    href: '/reports',
    labelKey: 'reports',
    iconKey: 'reports',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
    moreGroup: 'business',
  },
  {
    key: 'crm',
    href: '/crm',
    labelKey: 'crm',
    iconKey: 'crm',
    permission: PERMISSIONS.CRM_READ,
    module: 'crm',
    moreGroup: 'operations',
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
    href: '/workforce',
    labelKey: 'workforce',
    iconKey: 'workforce',
    permission: PERMISSIONS.WORKFORCE_READ,
    module: 'workforce',
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
    key: 'documents',
    href: '/documents',
    labelKey: 'documents',
    iconKey: 'documents',
    permission: PERMISSIONS.DOCUMENTS_READ,
    module: 'documents',
    moreGroup: 'operations',
  },
  {
    key: 'vendorBills',
    href: '/procurement/ap',
    labelKey: 'vendorBills',
    iconKey: 'procurement',
    permission: PERMISSIONS.AP_READ,
    module: 'procurement',
    moreGroup: 'advanced',
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
    key: 'settings',
    href: '/settings',
    labelKey: 'settings',
    iconKey: 'settings',
  },
];

export function visibleNavItems(
  permissions: ReadonlySet<string>,
  modules: ModuleVisibility,
): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.permission && !permissions.has(item.permission)) return false;
    if (item.module && !modules[item.module]) return false;
    return true;
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

/** Marks a nav item active, treating `/projects/123` as inside Projects. */
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
