import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { NavIconKey } from '@/components/shell/navigation';
import type { OptionalModuleKey } from './types';

export const DASHBOARD_QUICK_ACCESS_SETTING_KEY = 'dashboard_quick_access';

export const DASHBOARD_QUICK_ACCESS_MAX = 8;

export const DASHBOARD_QUICK_ACCESS_DEFAULT_KEYS = [
  'quickCapture',
  'attendance',
  'billing',
  'vendorBills',
  'expenses',
  'today',
] as const;

export const DASHBOARD_QUICK_ACCESS_KEYS = [
  'today',
  'attendance',
  'billing',
  'vendorBills',
  'expenses',
  'employees',
  'subcontracts',
  'documents',
  'projects',
  'jobs',
  'calendar',
  'reports',
  'invoicingSettings',
  'quickCapture',
] as const;

export type DashboardQuickAccessKey = (typeof DASHBOARD_QUICK_ACCESS_KEYS)[number];

export interface DashboardQuickAccessDefinition {
  readonly key: DashboardQuickAccessKey;
  readonly href: string;
  /** Nav label key unless `labelNamespace` is set. */
  readonly labelKey: string;
  readonly labelNamespace?: 'dashboard';
  readonly iconKey: NavIconKey;
  readonly permission?: PermissionKey;
  readonly anyPermissions?: readonly PermissionKey[];
  readonly module?: OptionalModuleKey;
}

export const DASHBOARD_QUICK_ACCESS_CATALOG: readonly DashboardQuickAccessDefinition[] = [
  {
    key: 'today',
    href: '/today',
    labelKey: 'today',
    iconKey: 'today',
    permission: PERMISSIONS.COMMAND_CENTER_READ,
  },
  {
    key: 'attendance',
    href: '/workforce/attendance',
    labelKey: 'attendance',
    iconKey: 'attendance',
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.WORKFORCE_READ,
    ],
    module: 'workforce',
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
    key: 'vendorBills',
    href: '/procurement/ap',
    labelKey: 'vendorBills',
    iconKey: 'procurement',
    permission: PERMISSIONS.AP_READ,
  },
  {
    key: 'expenses',
    href: '/expenses',
    labelKey: 'expenses',
    iconKey: 'expenses',
    permission: PERMISSIONS.EXPENSES_READ,
  },
  {
    key: 'employees',
    href: '/workforce/employees',
    labelKey: 'people',
    iconKey: 'workforce',
    permission: PERMISSIONS.WORKFORCE_READ,
    module: 'workforce',
  },
  {
    key: 'subcontracts',
    href: '/subcontracts',
    labelKey: 'subcontracts',
    iconKey: 'subcontracts',
    permission: PERMISSIONS.VENDORS_READ,
    module: 'vendors',
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
    key: 'projects',
    href: '/projects',
    labelKey: 'projects',
    iconKey: 'projects',
    permission: PERMISSIONS.PROJECTS_READ,
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
    key: 'calendar',
    href: '/calendar',
    labelKey: 'calendar',
    iconKey: 'calendar',
    permission: PERMISSIONS.SCHEDULING_READ,
  },
  {
    key: 'reports',
    href: '/reports',
    labelKey: 'reports',
    iconKey: 'reports',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
  },
  {
    key: 'invoicingSettings',
    href: '/settings/integrations',
    labelKey: 'invoicingSettings',
    labelNamespace: 'dashboard',
    iconKey: 'billing',
    permission: PERMISSIONS.INTEGRATIONS_READ,
  },
  {
    key: 'quickCapture',
    href: '/quick-capture',
    labelKey: 'quickCapture',
    labelNamespace: 'dashboard',
    iconKey: 'documents',
    permission: PERMISSIONS.DOCUMENTS_MANAGE,
    module: 'documents',
  },
];

const catalogByKey = new Map(
  DASHBOARD_QUICK_ACCESS_CATALOG.map((entry) => [entry.key, entry]),
);

export function isDashboardQuickAccessKey(value: string): value is DashboardQuickAccessKey {
  return (DASHBOARD_QUICK_ACCESS_KEYS as readonly string[]).includes(value);
}

export function getDashboardQuickAccessDefinition(
  key: DashboardQuickAccessKey,
): DashboardQuickAccessDefinition {
  const entry = catalogByKey.get(key);
  if (!entry) throw new Error(`Unknown dashboard shortcut: ${key}`);
  return entry;
}

export function parseDashboardQuickAccessPreference(raw: unknown): DashboardQuickAccessKey[] {
  if (!Array.isArray(raw)) return [...DASHBOARD_QUICK_ACCESS_DEFAULT_KEYS];
  const parsed = raw.filter((item): item is DashboardQuickAccessKey => isDashboardQuickAccessKey(String(item)));
  if (parsed.length === 0) return [...DASHBOARD_QUICK_ACCESS_DEFAULT_KEYS];
  return parsed.slice(0, DASHBOARD_QUICK_ACCESS_MAX);
}

export function isDashboardQuickAccessAccessible(
  definition: DashboardQuickAccessDefinition,
  permissions: ReadonlySet<string>,
  modules: Record<OptionalModuleKey, boolean>,
): boolean {
  if (definition.anyPermissions?.length) {
    if (!definition.anyPermissions.some((key) => permissions.has(key))) return false;
  } else if (definition.permission && !permissions.has(definition.permission)) {
    return false;
  }
  if (definition.module && !modules[definition.module]) return false;
  return true;
}

export function resolveDashboardQuickAccessShortcuts(
  savedKeys: readonly DashboardQuickAccessKey[],
  permissions: ReadonlySet<string>,
  modules: Record<OptionalModuleKey, boolean>,
): DashboardQuickAccessDefinition[] {
  const resolved: DashboardQuickAccessDefinition[] = [];
  const seen = new Set<DashboardQuickAccessKey>();

  for (const key of savedKeys) {
    if (seen.has(key)) continue;
    const definition = catalogByKey.get(key);
    if (!definition) continue;
    if (!isDashboardQuickAccessAccessible(definition, permissions, modules)) continue;
    seen.add(key);
    resolved.push(definition);
    if (resolved.length >= DASHBOARD_QUICK_ACCESS_MAX) break;
  }

  if (resolved.length > 0) return resolved;

  for (const key of DASHBOARD_QUICK_ACCESS_DEFAULT_KEYS) {
    const definition = catalogByKey.get(key);
    if (!definition) continue;
    if (!isDashboardQuickAccessAccessible(definition, permissions, modules)) continue;
    resolved.push(definition);
  }

  return resolved;
}

export function listAccessibleDashboardQuickAccessCatalog(
  permissions: ReadonlySet<string>,
  modules: Record<OptionalModuleKey, boolean>,
): DashboardQuickAccessDefinition[] {
  return DASHBOARD_QUICK_ACCESS_CATALOG.filter((entry) =>
    isDashboardQuickAccessAccessible(entry, permissions, modules),
  );
}
