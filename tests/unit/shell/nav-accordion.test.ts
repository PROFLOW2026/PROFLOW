import { describe, expect, it } from 'vitest';
import {
  findActiveNavGroup,
  nextExclusiveOpenGroup,
} from '@/components/shell/nav-accordion-state';
import { isNavItemActive, partitionNavItems, visibleNavItems } from '@/components/shell/navigation';
import { OPTIONAL_MODULE_KEYS } from '@/modules/tenancy/domain/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy';

function allModulesOn(): ModuleVisibility {
  return Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, true])) as ModuleVisibility;
}

describe('nav accordion grouping surface', () => {
  it('partitions experience groups without dumping children into core', () => {
    const items = visibleNavItems(new Set(Object.values(PERMISSIONS)), allModulesOn(), {
      persona: 'project_contractor',
      roleSurface: 'owner',
      workMix: 'projects',
    });
    const { core, groups } = partitionNavItems(items);
    expect(core.map((item) => item.key)).toEqual(
      expect.arrayContaining(['dashboard', 'projects']),
    );
    expect(core.map((item) => item.key)).not.toContain('today');
    expect(groups.length).toBeGreaterThan(0);
    for (const entry of groups) {
      expect(entry.items.length).toBeGreaterThan(0);
      expect(entry.items.every((item) => item.moreGroup === entry.group)).toBe(true);
    }
  });

  it('detects active child destinations for accordion auto-open', () => {
    expect(isNavItemActive('/expenses', '/expenses')).toBe(true);
    expect(isNavItemActive('/expenses/new', '/expenses')).toBe(true);
    expect(isNavItemActive('/projects', '/expenses')).toBe(false);
  });

  it('keeps maximum one open group and toggles closed on second click', () => {
    expect(nextExclusiveOpenGroup(null, 'money')).toBe('money');
    expect(nextExclusiveOpenGroup('money', 'clients')).toBe('clients');
    expect(nextExclusiveOpenGroup('clients', 'clients')).toBeNull();
  });

  it('finds the group owning the active path', () => {
    const groups = [
      {
        group: 'clients' as const,
        items: [
          { key: 'clients', href: '/clients', labelKey: 'clients', iconKey: 'clients' as const },
        ],
      },
      {
        group: 'money' as const,
        items: [
          {
            key: 'expenses',
            href: '/expenses',
            labelKey: 'expenses',
            iconKey: 'expenses' as const,
          },
        ],
      },
    ];
    expect(findActiveNavGroup(groups, '/expenses/new', isNavItemActive)).toBe('money');
    expect(findActiveNavGroup(groups, '/today', isNavItemActive)).toBeNull();
  });
});
