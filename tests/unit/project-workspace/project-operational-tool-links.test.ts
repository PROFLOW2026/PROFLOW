import { describe, expect, it } from 'vitest';
import { buildDeliveryProfile } from '@/modules/project-profile';
import { PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import { selectExecutionHubChildren } from '@/modules/project-workspace/domain/execution-hubs';
import {
  selectProjectOperationalToolLinks,
} from '@/modules/project-workspace/domain/project-operational-tool-links';
import { shouldShowExecutionNavGroup } from '@/modules/project-workspace/domain/select-execution-nav-links';

const projectManagement = buildDeliveryProfile({ operatingRoles: ['project_management'] });
const developerGc = buildDeliveryProfile({ operatingRoles: ['developer', 'general_contractor'] });
const PROJECT_ID = 'p-operational-tools';

describe('non-GC project operational tool links (EXL-A9)', () => {
  it('keeps the execution nav group closed on non-GC while surfacing RFI only when rfi.manage is held', () => {
    expect(shouldShowExecutionNavGroup({ deliveryProfile: projectManagement })).toBe(false);

    const withRfi = selectProjectOperationalToolLinks({
      projectId: PROJECT_ID,
      capabilities: new Set([C.RFI_MANAGE]),
      deliveryProfile: projectManagement,
      modules: { field_ops: true },
    });
    expect(withRfi.map((link) => link.id)).toEqual(['quality-rfi']);
    expect(withRfi[0]?.href).toBe(`/projects/${PROJECT_ID}/rfi`);

    const withoutRfi = selectProjectOperationalToolLinks({
      projectId: PROJECT_ID,
      capabilities: new Set([C.PROJECT_VIEW]),
      deliveryProfile: projectManagement,
      modules: { field_ops: true },
    });
    expect(withoutRfi.some((link) => link.id === 'quality-rfi')).toBe(false);
  });

  it('does not offer cost control on non-GC profiles', () => {
    const links = selectProjectOperationalToolLinks({
      projectId: PROJECT_ID,
      capabilities: new Set(Object.values(C)),
      deliveryProfile: projectManagement,
      modules: { field_ops: true },
    });
    expect(links.some((link) => link.href.includes('cost-control'))).toBe(false);
    expect(
      selectExecutionHubChildren({
        hub: 'payments',
        projectId: PROJECT_ID,
        capabilities: new Set(Object.values(C)),
      }).some((child) => child.path === 'cost-control'),
    ).toBe(true);
  });

  it('returns no direct tools for developer_gc (execution hubs own navigation)', () => {
    expect(
      selectProjectOperationalToolLinks({
        projectId: PROJECT_ID,
        capabilities: new Set(Object.values(C)),
        deliveryProfile: developerGc,
        modules: { field_ops: true },
      }),
    ).toEqual([]);
  });

  it('labels daily log and distinguishes project vs field inspections (EXL-A4)', () => {
    const links = selectProjectOperationalToolLinks({
      projectId: PROJECT_ID,
      capabilities: new Set([C.DAILY_LOG_MANAGE, C.QUALITY_MANAGE]),
      deliveryProfile: projectManagement,
      modules: { field_ops: true },
    });
    const daily = links.find((link) => link.id === 'quality-log');
    expect(daily?.labelKey).toBe('dailyLog');
    expect(daily?.href).toBe(`/field-ops/logs/new?projectId=${PROJECT_ID}`);

    const projectInspections = links.find((link) => link.id === 'quality-inspections');
    const fieldInspections = links.find((link) => link.id === 'field-inspections');
    expect(projectInspections?.labelKey).toBe('projectInspections');
    expect(fieldInspections?.labelKey).toBe('fieldInspections');
    expect(fieldInspections?.href).toBe(`/field-ops/inspections?projectId=${PROJECT_ID}`);
  });
});
