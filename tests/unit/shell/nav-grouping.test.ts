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
  it('keeps dashboard, projects, and expenses as primaryOnMobile in the base catalog', () => {
    const primary = NAV_ITEMS.filter((item) => item.primaryOnMobile).map((item) => item.key);
    expect(primary).toEqual(['dashboard', 'today', 'projects', 'expenses']);
  });

  it('includes jobs as a projects-permission destination under the jobs module', () => {
    const jobs = NAV_ITEMS.find((item) => item.key === 'jobs');
    expect(jobs?.href).toBe('/jobs');
    expect(jobs?.permission).toBe(PERMISSIONS.PROJECTS_READ);
    expect(jobs?.module).toBe('jobs');
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
    expect(byKey.recurringDrafts?.moreGroup).toBe('business');
    expect(byKey.reports?.moreGroup).toBe('business');

    expect(byKey.vendors?.moreGroup).toBe('operations');
    expect(byKey.workforce?.moreGroup).toBe('operations');
    expect(byKey.attendance?.moreGroup).toBe('operations');
    expect(byKey.scheduling?.moreGroup).toBe('operations');
    expect(byKey.scheduling?.href).toBe('/scheduling');
    expect(byKey.scheduling?.permission).toBe(PERMISSIONS.SCHEDULING_READ);
    expect(byKey.procurement?.moreGroup).toBe('operations');
    expect(byKey.materials?.moreGroup).toBe('operations');
    expect(byKey.fieldOps?.moreGroup).toBe('operations');
    expect(byKey.documents?.moreGroup).toBe('operations');
    expect(byKey.quotes?.moreGroup).toBe('business');
    expect(byKey.crm?.moreGroup).toBe('business');

    expect(byKey.assets?.moreGroup).toBe('advanced');
    expect(byKey.compliance?.moreGroup).toBe('advanced');
    expect(byKey.vendorBills?.moreGroup).toBe('advanced');
    expect(byKey.overhead?.moreGroup).toBe('advanced');
  });

  it('lists overhead under advanced when the overhead module is on', () => {
    const item = NAV_ITEMS.find((entry) => entry.key === 'overhead');
    expect(item?.href).toBe('/overhead');
    expect(item?.moreGroup).toBe('advanced');
    expect(item?.permission).toBe(PERMISSIONS.EXPENSES_READ);
    expect(item?.module).toBe('overhead');

    const modules = allModulesOn();
    const withModule = visibleNavItems(new Set([PERMISSIONS.EXPENSES_READ]), modules, {
      workMix: 'projects',
    });
    expect(withModule.some((entry) => entry.key === 'overhead')).toBe(true);

    modules.overhead = false;
    const withoutModule = visibleNavItems(new Set([PERMISSIONS.EXPENSES_READ]), modules, {
      workMix: 'projects',
    });
    expect(withoutModule.some((entry) => entry.key === 'overhead')).toBe(false);

    const noPermission = visibleNavItems(new Set([PERMISSIONS.PROJECTS_READ]), allModulesOn(), {
      workMix: 'projects',
    });
    expect(noPermission.some((entry) => entry.key === 'overhead')).toBe(false);
  });

  it('lists recurring financial drafts under business, distinct from service recurrence', () => {
    const item = NAV_ITEMS.find((entry) => entry.key === 'recurringDrafts');
    expect(item?.href).toBe('/recurring-drafts');
    expect(item?.moreGroup).toBe('business');
    expect(item?.anyPermissions).toEqual([
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.EXPENSES_CREATE,
      PERMISSIONS.AP_READ,
      PERMISSIONS.AP_MANAGE,
      PERMISSIONS.BILLING_READ,
      PERMISSIONS.BILLING_MANAGE,
    ]);
    const serviceRecurring = NAV_ITEMS.find((entry) => entry.key === 'serviceRecurring');
    expect(serviceRecurring?.href).toBe('/service/recurring');
    expect(item?.href).not.toBe(serviceRecurring?.href);
  });

  it('lists month close by permission even when the month_close module is off', () => {
    const modules = allModulesOn();
    modules.month_close = false;
    const items = visibleNavItems(new Set([PERMISSIONS.MONTH_CLOSE_READ]), modules, {
      workMix: 'projects',
    });
    expect(items.some((item) => item.key === 'monthClose')).toBe(true);
    expect(NAV_ITEMS.find((item) => item.key === 'monthClose')?.module).toBeUndefined();
  });

  it('lists vendor bills under advanced (not competing with CORE procurement)', () => {
    const vendorBills = NAV_ITEMS.find((item) => item.key === 'vendorBills');
    expect(vendorBills?.href).toBe('/procurement/ap');
    expect(vendorBills?.moreGroup).toBe('advanced');
    expect(vendorBills?.permission).toBe(PERMISSIONS.AP_READ);
  });

  it('lists attendance under operations for any attendance permission', () => {
    const attendance = NAV_ITEMS.find((item) => item.key === 'attendance');
    expect(attendance?.href).toBe('/workforce/attendance');
    expect(attendance?.moreGroup).toBe('operations');
    expect(attendance?.module).toBeUndefined();
    expect(attendance?.anyPermissions).toEqual([
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_SELF,
      PERMISSIONS.ATTENDANCE_MANAGE,
    ]);

    const selfOnly = visibleNavItems(
      new Set([PERMISSIONS.ATTENDANCE_SELF]),
      allModulesOn(),
      { workMix: 'projects' },
    );
    expect(selfOnly.some((item) => item.key === 'attendance')).toBe(true);

    const none = visibleNavItems(new Set([PERMISSIONS.WORKFORCE_READ]), allModulesOn(), {
      workMix: 'projects',
    });
    expect(none.some((item) => item.key === 'attendance')).toBe(false);
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
    const items = visibleNavItems(permissions, allModulesOn(), { workMix: 'projects' });
    const { core, groups, settings } = partitionNavItems(items);

    expect(core.map((item) => item.key)).toEqual(['dashboard', 'projects', 'expenses']);
    expect(groups.map((entry) => entry.group)).toEqual(
      MORE_GROUP_ORDER.filter((group) => groups.some((entry) => entry.group === group)),
    );
    expect(groups.find((entry) => entry.group === 'business')?.items.map((i) => i.key)).toEqual([
      'jobs',
      'clients',
      'recurringDrafts',
      'reports',
    ]);
    expect(groups.find((entry) => entry.group === 'operations')?.items.map((i) => i.key)).toEqual([
      'vendors',
      'vendorBills',
    ]);
    expect(groups.find((entry) => entry.group === 'advanced')?.items.map((i) => i.key)).toEqual([
      'assets',
      'overhead',
    ]);
    expect(settings.map((item) => item.key)).toEqual(['settings']);
  });
});
