import { describe, expect, it } from 'vitest';
import {
  contractorMayAccessUnlinkedXrefFile,
  contractorMayAccessXrefDrawing,
} from '@/modules/project-plans/domain/contractor-xref-access';
import { CONTRACTOR_PLAN_VIEW } from '@/modules/project-plans/domain/visibility';

describe('contractor xref access', () => {
  it('denies unlinked files under strict exposure', () => {
    expect(contractorMayAccessUnlinkedXrefFile()).toBe(false);
  });

  it('denies internal drawings', () => {
    const allowed = contractorMayAccessXrefDrawing(
      { principalId: 'p1', grants: [] },
      {
        drawingId: 'd1',
        organizationId: 'o1',
        projectId: 'pr1',
        status: 'active',
        contractorVisibility: 'internal',
        currentRevisionId: 'rev1',
      },
      [],
    );
    expect(allowed).toBe(false);
  });

  it('allows all_contractors when plan view grant covers project', () => {
    const allowed = contractorMayAccessXrefDrawing(
      { principalId: 'p1', grants: [
        {
          grantId: 'g1',
          organizationId: 'o1',
          vendorId: 'v1',
          projectId: 'pr1',
          subcontractAgreementId: null,
          capabilities: new Set([CONTRACTOR_PLAN_VIEW]),
          expiresAt: null,
        },
      ] },
      {
        drawingId: 'd1',
        organizationId: 'o1',
        projectId: 'pr1',
        status: 'active',
        contractorVisibility: 'all_contractors',
        currentRevisionId: 'rev1',
      },
      [],
    );
    expect(allowed).toBe(true);
  });
});