import { describe, expect, it } from 'vitest';
import { PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import { buildDeliveryProfile } from '@/modules/project-profile';
import {
  EXECUTION_NAV_PRIORITY,
  executionRoutesMissingPages,
  selectExecutionNavLinks,
  shouldShowExecutionNavGroup,
} from '@/modules/project-workspace';

describe('execution nav (Track S)', () => {
  const developerProfile = buildDeliveryProfile({ operatingRoles: ['developer'] });

  it('orders structure before team and keeps financial routes after field ops', () => {
    expect(EXECUTION_NAV_PRIORITY.indexOf('structure')).toBeLessThan(EXECUTION_NAV_PRIORITY.indexOf('team'));
    expect(EXECUTION_NAV_PRIORITY.indexOf('claims')).toBeLessThan(EXECUTION_NAV_PRIORITY.indexOf('deductions'));
    expect(EXECUTION_NAV_PRIORITY.indexOf('unpricedWork')).toBeLessThan(EXECUTION_NAV_PRIORITY.indexOf('costControl'));
  });

  it('shows the group for a non-standard delivery profile or subcontract agreements', () => {
    expect(shouldShowExecutionNavGroup({ deliveryProfile: developerProfile, hasSubcontractAgreements: false })).toBe(
      true,
    );
    expect(
      shouldShowExecutionNavGroup({ deliveryProfile: null, hasSubcontractAgreements: true }),
    ).toBe(true);
    expect(
      shouldShowExecutionNavGroup({
        deliveryProfile: buildDeliveryProfile({ operatingRoles: [] }),
        hasSubcontractAgreements: false,
      }),
    ).toBe(false);
  });

  it('filters links by capability and skips routes without pages', () => {
    const held = new Set([C.PROJECT_VIEW, C.CONTRACTOR_VIEW, C.CLAIM_VIEW]);
    const links = selectExecutionNavLinks({
      projectId: 'p1',
      capabilities: held,
      deliveryProfile: developerProfile,
      hasSubcontractAgreements: true,
    });

    const keys = links.map((link) => link.key);
    expect(keys).toContain('structure');
    expect(keys).toContain('team');
    expect(keys).toContain('unpricedWork');
    expect(keys).not.toContain('contractorAccess');
    expect(keys).toContain('claims');
    expect(keys).not.toContain('costControl');
    expect(keys).toContain('executionDashboard');

    const contractors = links.find((link) => link.key === 'contractors');
    expect(contractors?.href).toBe('/projects/p1/contractors');
  });

  it('never deep-links contractors to a single agreement when the list page is missing', () => {
    const held = new Set([C.CONTRACTOR_VIEW]);
    const links = selectExecutionNavLinks({
      projectId: 'p1',
      capabilities: held,
      deliveryProfile: developerProfile,
      hasSubcontractAgreements: true,
    });
    expect(links.some((link) => link.key === 'contractors' && link.href.includes('/changes'))).toBe(false);
  });

  it('reports missing page routes for release notes', () => {
    const missing = executionRoutesMissingPages();
    expect(missing).not.toContain('contractors');
    expect(missing).not.toContain('costControl');
    expect(missing).not.toContain('executionDashboard');
  });
});
