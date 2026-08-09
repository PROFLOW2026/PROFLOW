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
    key: 'billing',
    href: '/billing',
    labelKey: 'billing',
    iconKey: 'billing',
    permission: PERMISSIONS.BILLING_READ,
    module: 'billing',
  },
  {
    key: 'changes',
    href: '/changes',
    labelKey: 'changes',
    iconKey: 'changes',
    permission: PERMISSIONS.CHANGES_READ,
    module: 'changes',
  },
  {
    key: 'clients',
    href: '/clients',
    labelKey: 'clients',
    iconKey: 'clients',
    permission: PERMISSIONS.CLIENTS_READ,
    module: 'clients',
  },
  {
    key: 'vendors',
    href: '/vendors',
    labelKey: 'vendors',
    iconKey: 'vendors',
    permission: PERMISSIONS.VENDORS_READ,
    module: 'vendors',
  },
  {
    key: 'workforce',
    href: '/workforce',
    labelKey: 'workforce',
    iconKey: 'workforce',
    permission: PERMISSIONS.WORKFORCE_READ,
    module: 'workforce',
  },
  {
    key: 'documents',
    href: '/documents',
    labelKey: 'documents',
    iconKey: 'documents',
    permission: PERMISSIONS.DOCUMENTS_READ,
    module: 'documents',
  },
  {
    key: 'crm',
    href: '/crm',
    labelKey: 'crm',
    iconKey: 'crm',
    permission: PERMISSIONS.CRM_READ,
    module: 'crm',
  },
  {
    key: 'compliance',
    href: '/compliance',
    labelKey: 'compliance',
    iconKey: 'compliance',
    permission: PERMISSIONS.COMPLIANCE_READ,
    module: 'compliance',
  },
  {
    key: 'procurement',
    href: '/procurement',
    labelKey: 'procurement',
    iconKey: 'procurement',
    permission: PERMISSIONS.PROCUREMENT_READ,
    module: 'procurement',
  },
  {
    key: 'materials',
    href: '/procurement/materials',
    labelKey: 'materials',
    iconKey: 'materials',
    permission: PERMISSIONS.MATERIALS_READ,
    module: 'materials',
  },
  {
    key: 'fieldOps',
    href: '/field-ops',
    labelKey: 'fieldOps',
    iconKey: 'fieldOps',
    permission: PERMISSIONS.FIELD_OPS_READ,
    module: 'field_ops',
  },
  {
    key: 'assets',
    href: '/assets',
    labelKey: 'assets',
    iconKey: 'assets',
    permission: PERMISSIONS.ASSETS_READ,
    module: 'assets',
  },
  {
    key: 'reports',
    href: '/reports',
    labelKey: 'reports',
    iconKey: 'reports',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
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
