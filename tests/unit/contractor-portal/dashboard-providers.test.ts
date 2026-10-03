import { describe, expect, it } from 'vitest';
import { PORTAL_SECTION_PROVIDERS } from '@/modules/contractor-portal/application/registry';
import {
  claimShowsNetAmount,
  paymentShowsNetAmount,
} from '@/modules/contractor-portal/application/providers/claims';
import { planPortalSections, type PortalProjectAccess } from '@/modules/contractor-portal';
import { EXTERNAL_CAPABILITIES as CAP, type ExternalContext } from '@/shared/external';

const ORG = 'org-1';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const VENDOR = 'vendor-a';
const AGREEMENT = '22222222-2222-4222-8222-222222222222';

const OPERATIONAL = [
  CAP.PROJECT_VIEW,
  CAP.SCHEDULE_VIEW,
  CAP.TASK_WORK,
  CAP.PLAN_VIEW,
  CAP.DOCUMENT_VIEW,
  CAP.SUBMITTAL_SUBMIT,
] as const;

function project(capabilities: readonly string[]): PortalProjectAccess {
  return {
    organizationId: ORG,
    organizationName: 'Builder Ltd',
    projectId: PROJECT,
    projectName: 'Tower',
    projectNumber: null,
    vendors: [{ vendorId: VENDOR, vendorName: 'Vendor' }],
    grantIds: ['g1'],
    capabilities: new Set(capabilities),
  };
}

function context(capabilities: readonly string[]): ExternalContext {
  return {
    principalId: 'principal-1',
    authUserId: 'auth-1',
    displayName: null,
    locale: 'he-IL',
    grants: [
      {
        grantId: 'g1',
        organizationId: ORG,
        vendorId: VENDOR,
        projectId: PROJECT,
        subcontractAgreementId: null,
        capabilities: new Set(capabilities),
        expiresAt: null,
      },
    ],
    db: null as never,
  };
}

const claimScope = {
  projectId: PROJECT,
  vendorId: VENDOR,
  agreementId: AGREEMENT,
};

describe('contractor portal dashboard providers', () => {
  it('registers plans, documents, submittals and claims providers', () => {
    const sections = new Set(PORTAL_SECTION_PROVIDERS.map((provider) => provider.section));
    expect(sections.has('planRevisions')).toBe(true);
    expect(sections.has('documents')).toBe(true);
    expect(sections.has('submittals')).toBe(true);
    expect(sections.has('claims')).toBe(true);
    expect(sections.has('certifications')).toBe(true);
    expect(sections.has('retention')).toBe(true);
    expect(sections.has('payments')).toBe(true);
    expect(sections.has('milestones')).toBe(true);
  });

  it('omits financial sections when the grant has no claim or payment capability', () => {
    const ids = planPortalSections([project(OPERATIONAL)], PORTAL_SECTION_PROVIDERS).map((plan) => plan.section.id);
    expect(ids).toContain('planRevisions');
    expect(ids).toContain('documents');
    expect(ids).toContain('submittals');
    expect(ids).not.toContain('claims');
    expect(ids).not.toContain('certifications');
    expect(ids).not.toContain('retention');
    expect(ids).not.toContain('payments');
    expect(ids).toContain('milestones');
  });

  it('shows claim titles without payment sections when only claim view is granted', () => {
    const ids = planPortalSections([project([CAP.PROJECT_VIEW, CAP.CLAIM_VIEW])], PORTAL_SECTION_PROVIDERS).map(
      (plan) => plan.section.id,
    );
    expect(ids).toContain('claims');
    expect(ids).toContain('certifications');
    expect(ids).toContain('milestones');
    expect(ids).not.toContain('payments');
    expect(ids).not.toContain('retention');
  });

  it('hides milestones unless the grant can view the project or the schedule', () => {
    const claimOnly = planPortalSections([project([CAP.CLAIM_VIEW])], PORTAL_SECTION_PROVIDERS).map(
      (plan) => plan.section.id,
    );
    expect(claimOnly).not.toContain('milestones');
    expect(
      planPortalSections([project([CAP.SCHEDULE_VIEW])], PORTAL_SECTION_PROVIDERS).map((plan) => plan.section.id),
    ).toContain('milestones');
  });

  it('hides NET amounts unless the grant includes contract value or payment view', () => {
    const target = {
      organizationId: ORG,
      projectId: PROJECT,
      vendorIds: [VENDOR],
      grantIds: ['g1'],
    };
    expect(claimShowsNetAmount(context([CAP.CLAIM_VIEW]), ORG, claimScope)).toBe(false);
    expect(claimShowsNetAmount(context([CAP.CLAIM_VIEW, CAP.CONTRACT_VIEW_VALUE]), ORG, claimScope)).toBe(true);
    expect(paymentShowsNetAmount(context([CAP.CLAIM_VIEW]), target, AGREEMENT)).toBe(false);
    expect(paymentShowsNetAmount(context([CAP.PAYMENT_VIEW]), target, AGREEMENT)).toBe(true);
  });
});
