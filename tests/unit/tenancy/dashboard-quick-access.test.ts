import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_QUICK_ACCESS_DEFAULT_KEYS,
  DASHBOARD_QUICK_ACCESS_MAX,
  parseDashboardQuickAccessPreference,
  resolveDashboardQuickAccessShortcuts,
} from '@/modules/tenancy/domain/dashboard-quick-access';
import { OPTIONAL_MODULE_KEYS, type OptionalModuleKey } from '@/modules/tenancy/domain/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const ALL_MODULES = Object.fromEntries(
  OPTIONAL_MODULE_KEYS.map((key) => [key, true]),
) as Record<OptionalModuleKey, boolean>;

const OWNER_PERMISSIONS = new Set<string>([
  PERMISSIONS.COMMAND_CENTER_READ,
  PERMISSIONS.ATTENDANCE_READ,
  PERMISSIONS.WORKFORCE_READ,
  PERMISSIONS.BILLING_READ,
  PERMISSIONS.AP_READ,
  PERMISSIONS.EXPENSES_READ,
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.PROJECT_FINANCIALS_READ,
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.SCHEDULING_READ,
  PERMISSIONS.SETTINGS_MANAGE,
]);

describe('dashboard quick access defaults', () => {
  it('returns five contractor-friendly defaults when no preference exists', () => {
    expect(DASHBOARD_QUICK_ACCESS_DEFAULT_KEYS).toEqual([
      'attendance',
      'billing',
      'vendorBills',
      'expenses',
      'today',
    ]);
    expect(parseDashboardQuickAccessPreference(undefined)).toEqual([
      ...DASHBOARD_QUICK_ACCESS_DEFAULT_KEYS,
    ]);
  });

  it('resolves saved preferences in order up to max shortcuts', () => {
    const saved = ['reports', 'expenses', 'billing', 'today', 'employees', 'documents', 'calendar', 'projects', 'jobs'];
    const resolved = resolveDashboardQuickAccessShortcuts(
      parseDashboardQuickAccessPreference(saved),
      OWNER_PERMISSIONS,
      ALL_MODULES,
    );
    expect(resolved.map((entry) => entry.key)).toEqual(saved.slice(0, DASHBOARD_QUICK_ACCESS_MAX));
  });

  it('skips shortcuts when module or permission is unavailable', () => {
    const resolved = resolveDashboardQuickAccessShortcuts(
      ['attendance', 'billing'],
      OWNER_PERMISSIONS,
      { ...ALL_MODULES, workforce: false, billing: false },
    );
    expect(resolved.map((entry) => entry.key)).toEqual(['vendorBills', 'expenses', 'today']);
  });

  it('supports add remove reorder via preference parsing', () => {
    const reordered = parseDashboardQuickAccessPreference(['today', 'expenses', 'billing']);
    expect(reordered).toEqual(['today', 'expenses', 'billing']);

    const removed = parseDashboardQuickAccessPreference(['today', 'expenses']);
    expect(removed).toEqual(['today', 'expenses']);

    const added = parseDashboardQuickAccessPreference(['today', 'expenses', 'reports', 'documents']);
    expect(added).toEqual(['today', 'expenses', 'reports', 'documents']);
  });
});
