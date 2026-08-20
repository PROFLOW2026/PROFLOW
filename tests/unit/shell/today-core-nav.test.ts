import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  partitionNavItems,
  selectMobilePrimaryItems,
  visibleNavItems,
} from '@/components/shell/navigation';
import { CUSTOMER_FEATURE_MODULE_KEYS, OPTIONAL_MODULE_KEYS } from '@/modules/tenancy/domain/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';

function modulesOffExcept(on: Partial<ModuleVisibility> = {}): ModuleVisibility {
  return Object.fromEntries(
    OPTIONAL_MODULE_KEYS.map((key) => [key, Boolean(on[key])]),
  ) as ModuleVisibility;
}

describe('Today is a core permission destination', () => {
  it('does not gate the Today nav item on the command_center module', () => {
    const today = NAV_ITEMS.find((item) => item.key === 'today');
    expect(today?.module).toBeUndefined();
    expect(today?.permission).toBe(PERMISSIONS.COMMAND_CENTER_READ);
    expect(today?.primaryOnMobile).toBe(true);
  });

  it('keeps Today visible for an owner with command_center.read when the old module preference is off', () => {
    const items = visibleNavItems(
      new Set([
        PERMISSIONS.COMMAND_CENTER_READ,
        PERMISSIONS.PROJECTS_READ,
        PERMISSIONS.EXPENSES_READ,
      ]),
      modulesOffExcept(),
      { workMix: 'projects', persona: 'project_contractor' },
    );
    expect(items.map((item) => item.key)).toEqual(
      expect.arrayContaining(['dashboard', 'today', 'projects', 'expenses']),
    );
    expect(partitionNavItems(items).core.map((item) => item.key)).toEqual([
      'dashboard',
      'today',
      'projects',
      'expenses',
    ]);
  });

  it('hides Today when the user lacks command_center.read', () => {
    const items = visibleNavItems(
      new Set([PERMISSIONS.PROJECTS_READ, PERMISSIONS.EXPENSES_READ]),
      modulesOffExcept({ command_center: true }),
      { workMix: 'projects' },
    );
    expect(items.some((item) => item.key === 'today')).toBe(false);
  });

  it('keeps Today in the first four mobile destinations even when jobs is also primary', () => {
    const items = visibleNavItems(
      new Set([
        PERMISSIONS.COMMAND_CENTER_READ,
        PERMISSIONS.PROJECTS_READ,
        PERMISSIONS.EXPENSES_READ,
      ]),
      modulesOffExcept({ jobs: true }),
      { workMix: 'mixed', persona: 'mixed' },
    );
    const primary = selectMobilePrimaryItems(items);
    expect(primary.map((item) => item.key)).toEqual(['dashboard', 'today', 'projects', 'jobs']);
    expect(primary.some((item) => item.key === 'today')).toBe(true);
  });

  it('removes Today from Settings → Features toggles while keeping the stored key harmless', () => {
    expect(OPTIONAL_MODULE_KEYS).toContain('command_center');
    expect(CUSTOMER_FEATURE_MODULE_KEYS).not.toContain('command_center');
  });

  it('does not tell an eligible owner that Today is turned off', () => {
    const catalog = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'commandCenter'));
    expect(catalog.get('title')).toBe('היום');
    expect(catalog.get('description')).toBe('כל מה שדורש טיפול עכשיו.');
    expect(catalog.get('moduleOff.title')).not.toMatch(/היום כבוי/);
    expect(catalog.get('errors.moduleOff')).not.toMatch(/היום כבוי/);
    expect(JSON.stringify(catalog)).not.toMatch(/היום כבוי/);
  });
});
