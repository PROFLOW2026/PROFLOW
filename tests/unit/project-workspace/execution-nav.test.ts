import { describe, expect, it } from 'vitest';
import { PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import { buildDeliveryProfile } from '@/modules/project-profile';
import { resolveManagementMode } from '@/modules/project-profile/domain/management-mode';
import {
  EXECUTION_HUB_KEYS,
  selectExecutionHubChildren,
  selectExecutionHubs,
} from '@/modules/project-workspace/domain/execution-hubs';
import {
  EXECUTION_NAV_PRIORITY,
  executionRoutesMissingPages,
  shouldShowExecutionNavGroup,
} from '@/modules/project-workspace';

const developerGc = buildDeliveryProfile({ operatingRoles: ['developer', 'general_contractor'] });

describe('developer / GC execution hubs', () => {
  it('keeps the registered route catalog static', () => {
    expect(EXECUTION_NAV_PRIORITY.indexOf('structure')).toBeLessThan(EXECUTION_NAV_PRIORITY.indexOf('team'));
    expect(executionRoutesMissingPages()).not.toContain('contractors');
    expect(executionRoutesMissingPages()).not.toContain('executionDashboard');
  });

  it('opens the layer only for an explicit developer + general contractor mode', () => {
    expect(resolveManagementMode(developerGc)).toBe('developer_gc');
    expect(shouldShowExecutionNavGroup({ deliveryProfile: developerGc, hasSubcontractAgreements: false })).toBe(true);
    expect(shouldShowExecutionNavGroup({ deliveryProfile: null, hasSubcontractAgreements: true })).toBe(false);
    expect(
      shouldShowExecutionNavGroup({
        deliveryProfile: buildDeliveryProfile({ operatingRoles: ['developer'] }),
        hasSubcontractAgreements: true,
      }),
    ).toBe(false);
    expect(
      shouldShowExecutionNavGroup({
        deliveryProfile: buildDeliveryProfile({ operatingRoles: ['subcontractor'] }),
        hasSubcontractAgreements: false,
      }),
    ).toBe(false);
    expect(
      shouldShowExecutionNavGroup({
        deliveryProfile: buildDeliveryProfile({ operatingRoles: ['project_management'] }),
        hasSubcontractAgreements: false,
      }),
    ).toBe(false);
    expect(
      shouldShowExecutionNavGroup({
        deliveryProfile: buildDeliveryProfile({ operatingRoles: [] }),
        hasSubcontractAgreements: false,
      }),
    ).toBe(false);
  });

  it('shows all seven hubs to a viewer who holds every capability', () => {
    const links = selectExecutionHubs({
      projectId: 'p1',
      capabilities: new Set(Object.values(C)),
      deliveryProfile: developerGc,
    });
    expect(links.map((link) => link.key)).toEqual([...EXECUTION_HUB_KEYS]);
    expect(links.find((link) => link.key === 'planning')?.href).toBe('/projects/p1/execution-planning');
    expect(links.some((link) => link.href.includes('?tab=schedule'))).toBe(false);
  });

  it('hides hubs the viewer cannot open', () => {
    const links = selectExecutionHubs({
      projectId: 'p1',
      capabilities: new Set([C.PROJECT_VIEW]),
      deliveryProfile: developerGc,
    });
    expect(links.map((link) => link.key)).toEqual(['overview', 'team']);
  });

  it('keeps the planning hub off the classic schedule tab', () => {
    const children = selectExecutionHubChildren({
      hub: 'planning',
      projectId: 'p1',
      capabilities: new Set(Object.values(C)),
    });
    expect(children.some((child) => child.href.includes('?tab=schedule'))).toBe(false);
    expect(children.map((child) => child.path)).toContain('coordination');
    expect(children.map((child) => child.path)).toContain('timeline');
  });
});
