import { describe, expect, it } from 'vitest';
import { connectedDeveloperCapabilities } from '@/modules/connected-projects/domain/grant-bridge';
import { visibleDeveloperWorkflowTabs } from '@/modules/connected-projects/domain/developer-workflows';
import { resolvePortalProjects } from '@/modules/contractor-portal/domain/project-access';
import { buildPortalProjectNav } from '@/modules/contractor-portal/domain/nav';
import { EXTERNAL_CAPABILITIES as CAP, type ExternalGrantView } from '@/shared/external';

const ORG = 'org-dev';
const PROJECT = 'proj-dev';
const AGREEMENT = 'agr-1';
const VENDOR = 'vendor-a';

function grant(
  overrides: Partial<Omit<ExternalGrantView, 'capabilities'>> & { capabilities: readonly string[] },
): ExternalGrantView {
  return {
    grantId: overrides.grantId ?? 'g1',
    organizationId: overrides.organizationId ?? ORG,
    vendorId: overrides.vendorId ?? VENDOR,
    projectId: overrides.projectId === undefined ? PROJECT : overrides.projectId,
    subcontractAgreementId: overrides.subcontractAgreementId ?? AGREEMENT,
    capabilities: new Set(overrides.capabilities),
    expiresAt: overrides.expiresAt ?? null,
  };
}

const mapping = {
  developerOrganizationId: ORG,
  developerProjectId: PROJECT,
  subcontractAgreementId: AGREEMENT,
  vendorId: VENDOR,
};

describe('guest vs registered developer grant parity (mock grants)', () => {
  it('gives connected org the same ext.* union as the guest portal for one engagement', () => {
    const grants = [
      grant({
        grantId: 'g1',
        capabilities: [CAP.PROJECT_VIEW, CAP.TASK_WORK, CAP.CLAIM_VIEW, CAP.PAYMENT_VIEW],
      }),
    ];

    const guestProject = resolvePortalProjects(grants, [
      {
        grantId: 'g1',
        organizationId: ORG,
        organizationName: 'Developer Ltd',
        vendorId: VENDOR,
        vendorName: 'Subco',
        projectId: PROJECT,
        projectName: 'Tower',
        projectNumber: null,
      },
    ])[0]!;

    const registeredCaps = connectedDeveloperCapabilities(grants, mapping);
    expect([...registeredCaps].sort()).toEqual([...guestProject.capabilities].sort());
  });

  it('does not add capabilities from org membership — only covering external grants count', () => {
    const registeredCaps = connectedDeveloperCapabilities([], mapping);
    expect(registeredCaps.size).toBe(0);
  });

  it('excludes expired grants from registered developer capabilities', () => {
    const grants = [
      grant({
        capabilities: [CAP.PROJECT_VIEW, CAP.TASK_WORK],
        expiresAt: new Date('2020-01-01'),
      }),
    ];
    expect(connectedDeveloperCapabilities(grants, mapping, new Date('2026-01-01')).size).toBe(0);
  });

  it('gates registered workflow tabs with the same capability set as guest project nav', () => {
    const capabilities = new Set([CAP.PROJECT_VIEW, CAP.TASK_REPORT, CAP.RFI_VIEW, CAP.PLAN_VIEW]);
    const guestNavKeys = buildPortalProjectNav(PROJECT, capabilities).map((item) => item.key);
    expect(guestNavKeys).toContain('project.tasks');
    expect(guestNavKeys).toContain('project.rfi');
    expect(guestNavKeys).toContain('project.plans');

    const registeredTabs = visibleDeveloperWorkflowTabs(capabilities).map((tab) => tab.key);
    expect(registeredTabs).toEqual(['tasks', 'rfi', 'plans']);
    expect(registeredTabs.every((key) => guestNavKeys.some((routeKey) => routeKey.includes(key)))).toBe(true);
  });
});
