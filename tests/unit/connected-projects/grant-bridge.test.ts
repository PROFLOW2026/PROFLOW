import { describe, expect, it } from 'vitest';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import {
  connectedDeveloperCapabilities,
  grantsCoveringConnectedMapping,
  pickPrimaryCoveringGrant,
} from '@/modules/connected-projects/domain/grant-bridge';
import type { ExternalGrantView } from '@/shared/external';

const mapping = {
  developerOrganizationId: 'org-dev',
  developerProjectId: 'proj-dev',
  subcontractAgreementId: 'agr-1',
  vendorId: 'vendor-1',
};

function grant(partial: Partial<ExternalGrantView> & Pick<ExternalGrantView, 'grantId'>): ExternalGrantView {
  return {
    organizationId: mapping.developerOrganizationId,
    vendorId: mapping.vendorId,
    projectId: mapping.developerProjectId,
    subcontractAgreementId: mapping.subcontractAgreementId,
    capabilities: new Set([EXTERNAL_CAPABILITIES.TASK_WORK]),
    expiresAt: null,
    ...partial,
  };
}

describe('connected-projects grant bridge', () => {
  it('ignores org-unrelated grants and expired grants', () => {
    const grants = [
      grant({ grantId: 'g1' }),
      grant({ grantId: 'g2', organizationId: 'other-org' }),
      grant({ grantId: 'g3', expiresAt: new Date('2020-01-01') }),
    ];
    expect(grantsCoveringConnectedMapping(grants, mapping, new Date('2026-01-01'))).toHaveLength(1);
  });

  it('unions ext.* capabilities from all covering grants', () => {
    const grants = [
      grant({ grantId: 'g1', capabilities: new Set([EXTERNAL_CAPABILITIES.TASK_WORK]) }),
      grant({
        grantId: 'g2',
        capabilities: new Set([EXTERNAL_CAPABILITIES.RFI_VIEW]),
        subcontractAgreementId: null,
      }),
    ];
    const caps = connectedDeveloperCapabilities(grants, mapping);
    expect(caps.has(EXTERNAL_CAPABILITIES.TASK_WORK)).toBe(true);
    expect(caps.has(EXTERNAL_CAPABILITIES.RFI_VIEW)).toBe(true);
  });

  it('prefers agreement-scoped grant as primary', () => {
    const grants = [
      grant({ grantId: 'broad', subcontractAgreementId: null }),
      grant({ grantId: 'specific', subcontractAgreementId: mapping.subcontractAgreementId }),
    ];
    expect(pickPrimaryCoveringGrant(grants, mapping)?.grantId).toBe('specific');
  });
});
