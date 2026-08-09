import { describe, expect, it } from 'vitest';
import {
  MORE_GROUP_ORDER,
  NAV_ITEMS,
  partitionNavItems,
  visibleNavItems,
} from '@/components/shell/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy';
import { OPTIONAL_MODULE_KEYS } from '@/modules/tenancy/domain/types';

function allModulesOn(): ModuleVisibility {
  return Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, true])) as ModuleVisibility;
}

describe('nav grouping', () => {
  it('keeps only dashboard, projects, and expenses as primaryOnMobile', () => {
    const primary = NAV_ITEMS.filter((item) => item.primaryOnMobile).map((item) => item.key);
    expect(primary).toEqual(['dashboard', 'projects', 'expenses']);
  });

  it('assigns moreGroup to overflow destinations and leaves core/settings ungrouped', () => {
    const byKey = Object.fromEntries(NAV_ITEMS.map((item) => [item.key, item]));

    expect(byKey.dashboard?.moreGroup).toBeUndefined();
    expect(byKey.projects?.moreGroup).toBeUndefined();
    expect(byKey.expenses?.moreGroup).toBeUndefined();
    expect(byKey.settings?.moreGroup).toBeUndefined();

    expect(byKey.clients?.moreGroup).toBe('business');
    expect(byKey.changes?.moreGroup).toBe('business');
    expect(byKey.billing?.moreGroup).toBe('business');
    expect(byKey.reports?.moreGroup).toBe('business');

    expect(byKey.vendors?.moreGroup).toBe('operations');
    expect(byKey.workforce?.moreGroup).toBe('operations');
    expect(byKey.procurement?.moreGroup).toBe('operations');
    expect(byKey.materials?.moreGroup).toBe('operations');
    expect(byKey.fieldOps?.moreGroup).toBe('operations');
    expect(byKey.documents?.moreGroup).toBe('operations');
    expect(byKey.crm?.moreGroup).toBe('operations');

    expect(byKey.assets?.moreGroup).toBe('advanced');
    expect(byKey.compliance?.moreGroup).toBe('advanced');
    expect(byKey.vendorBills?.moreGroup).toBe('advanced');
  });

  it('lists vendor bills under advanced (not competing with CORE procurement)', () => {
    const vendorBills = NAV_ITEMS.find((item) => item.key === 'vendorBills');
    expect(vendorBills?.href).toBe('/procurement/ap');
    expect(vendorBills?.moreGroup).toBe('advanced');
    expect(vendorBills?.permission).toBe(PERMISSIONS.AP_READ);
  });

  it('partitions core → group order → settings last', () => {
    const permissions = new Set([
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.CLIENTS_READ,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.ASSETS_READ,
      PERMISSIONS.AP_READ,
      PERMISSIONS.PROJECT_FINANCIALS_READ,
    ]);
    const items = visibleNavItems(permissions, allModulesOn());
    const { core, groups, settings } = partitionNavItems(items);

    expect(core.map((item) => item.key)).toEqual(['dashboard', 'projects', 'expenses']);
    expect(groups.map((entry) => entry.group)).toEqual(
      MORE_GROUP_ORDER.filter((group) => groups.some((entry) => entry.group === group)),
    );
    expect(groups.find((entry) => entry.group === 'business')?.items.map((i) => i.key)).toEqual([
      'clients',
      'reports',
    ]);
    expect(groups.find((entry) => entry.group === 'operations')?.items.map((i) => i.key)).toEqual([
      'vendors',
    ]);
    expect(groups.find((entry) => entry.group === 'advanced')?.items.map((i) => i.key)).toEqual([
      'vendorBills',
      'assets',
    ]);
    expect(settings.map((item) => item.key)).toEqual(['settings']);
  });
});
