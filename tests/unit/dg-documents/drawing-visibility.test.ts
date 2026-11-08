import { describe, expect, it } from 'vitest';
import {
  contractorMayViewDrawing,
  type ContractorDrawingGrant,
  type DrawingDistributionFact,
} from '@/modules/project-plans/domain/visibility';

const ORG = 'org';
const PROJECT = 'project';
const OTHER = 'other-project';
const VENDOR = 'vendor-a';
const OTHER_VENDOR = 'vendor-b';
const AGREEMENT = 'agreement-a';
const PRINCIPAL = 'principal-a';
const NOW = new Date('2026-11-08T12:00:00.000Z');

function grant(overrides: Partial<ContractorDrawingGrant> = {}): ContractorDrawingGrant {
  return {
    organizationId: ORG,
    vendorId: VENDOR,
    projectId: PROJECT,
    subcontractAgreementId: null,
    capabilities: new Set(['ext.plan.view']),
    expiresAt: null,
    ...overrides,
  };
}

function view(overrides: Partial<Parameters<typeof contractorMayViewDrawing>[0]> = {}) {
  return contractorMayViewDrawing({
    visibility: 'all_contractors',
    status: 'active',
    hasPublishedRevision: true,
    organizationId: ORG,
    projectId: PROJECT,
    principalId: PRINCIPAL,
    grants: [grant()],
    distribution: [],
    now: NOW,
    ...overrides,
  });
}
describe('contractorMayViewDrawing', () => {
  it('hides internal drawings even when the contractor has plan.view and project access', () => {
    expect(view({ visibility: 'internal' })).toBe(false);
  });

  it('denies unknown and empty visibility', () => {
    expect(view({ visibility: '' })).toBe(false);
    expect(view({ visibility: null })).toBe(false);
    expect(view({ visibility: 'public' })).toBe(false);
    expect(view({ visibility: undefined })).toBe(false);
  });

  it('requires both ext.plan.view and project access for all_contractors', () => {
    expect(view()).toBe(true);
    expect(view({ grants: [grant({ projectId: null })] })).toBe(true);
    expect(view({ grants: [grant({ capabilities: new Set(['ext.project.view']) })] })).toBe(false);
    expect(view({ grants: [grant({ projectId: OTHER })] })).toBe(false);
    expect(view({ grants: [] })).toBe(false);
    expect(view({ grants: [grant({ expiresAt: new Date('2026-11-08T11:00:00.000Z') })] })).toBe(false);
    expect(view({ status: 'archived' })).toBe(false);
    expect(view({ hasPublishedRevision: false })).toBe(false);
  });

  it('requires a distribution row for that contractor plus both checks', () => {
    const agreement: DrawingDistributionFact = {
      audience: 'agreement',
      vendorId: VENDOR,
      agreementId: AGREEMENT,
      principalId: null,
    };
    const principal: DrawingDistributionFact = {
      audience: 'principal',
      vendorId: VENDOR,
      agreementId: null,
      principalId: PRINCIPAL,
    };
    expect(view({ visibility: 'distribution', distribution: [] })).toBe(false);
    expect(view({ visibility: 'distribution', distribution: [agreement] })).toBe(true);
    expect(
      view({
        visibility: 'distribution',
        distribution: [agreement],
        grants: [grant({ subcontractAgreementId: 'other-agreement' })],
      }),
    ).toBe(false);
    expect(
      view({
        visibility: 'distribution',
        distribution: [{ ...agreement, vendorId: OTHER_VENDOR }],
      }),
    ).toBe(false);
    expect(view({ visibility: 'distribution', distribution: [principal] })).toBe(true);
    expect(
      view({
        visibility: 'distribution',
        distribution: [{ ...principal, principalId: 'someone-else' }],
      }),
    ).toBe(false);
    expect(
      view({
        visibility: 'distribution',
        distribution: [agreement],
        grants: [grant({ capabilities: new Set(['ext.project.view']) })],
      }),
    ).toBe(false);
    expect(
      view({
        visibility: 'distribution',
        distribution: [principal],
        grants: [grant({ projectId: OTHER })],
      }),
    ).toBe(false);
  });
});