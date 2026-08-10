import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { selectProjectWorkspaceLinks } from '@/modules/projects/domain/workspace-links';

describe('project workspace links', () => {
  it('always includes overview, schedule, and details', () => {
    const links = selectProjectWorkspaceLinks({
      projectId: 'p1',
      modules: {},
      permissions: new Set([PERMISSIONS.EXPENSES_READ]),
      showWorkPackages: false,
      canReadFinancials: false,
    });
    expect(links.map((link) => link.key)).toEqual([
      'overview',
      'expenses',
      'details',
      'schedule',
    ]);
  });

  it('gates optional modules and permissions progressively', () => {
    const links = selectProjectWorkspaceLinks({
      projectId: 'p1',
      modules: {
        billing: true,
        procurement: true,
        field_ops: true,
        compliance: true,
        vendors: false,
      },
      permissions: new Set([
        PERMISSIONS.BILLING_READ,
        PERMISSIONS.PROCUREMENT_READ,
        PERMISSIONS.AP_READ,
        PERMISSIONS.FIELD_OPS_READ,
        PERMISSIONS.COMPLIANCE_READ,
        PERMISSIONS.VENDORS_READ,
      ]),
      showWorkPackages: true,
      canReadFinancials: true,
    });

    const keys = links.map((link) => link.key);
    expect(keys).toContain('financials');
    expect(keys).toContain('billing');
    expect(keys).toContain('work');
    expect(keys).toContain('procurement');
    expect(keys).toContain('ap');
    expect(keys).toContain('field_ops');
    expect(keys).toContain('compliance');
    expect(keys).not.toContain('vendors');
    expect(keys.indexOf('billing')).toBeLessThan(keys.indexOf('work'));
    expect(keys.indexOf('work')).toBeLessThan(keys.indexOf('details'));
    expect(keys.indexOf('details')).toBeLessThan(keys.indexOf('schedule'));
  });

  it('surfaces team and employees when workforce.read is granted (module optional)', () => {
    const links = selectProjectWorkspaceLinks({
      projectId: 'p1',
      modules: {},
      permissions: new Set([PERMISSIONS.WORKFORCE_READ]),
      showWorkPackages: false,
      canReadFinancials: false,
    });
    const keys = links.map((link) => link.key);
    expect(keys).toContain('team');
    expect(keys).toContain('time');
    expect(keys).toContain('workforce');
    expect(keys.indexOf('team')).toBeLessThan(keys.indexOf('time'));
  });
});
