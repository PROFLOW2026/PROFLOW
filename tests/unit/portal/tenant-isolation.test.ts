import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertGrantBelongsToOrganization,
  assertSameOrganization,
  grantMatchesOrganization,
} from '@/modules/portal/domain/tenant-isolation';
import {
  buildCustomerPortalSession,
  grantCoversProject,
  grantIsActive,
} from '@/modules/portal/domain/safe-project-summary';
import {
  assertVendorGrantActive,
  buildVendorPortalSession,
} from '@/modules/portal/domain/safe-vendor-projection';
import type { ExternalAccessGrantRecord } from '@/modules/portal/domain/types';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeGrant(overrides: Partial<ExternalAccessGrantRecord> = {}): ExternalAccessGrantRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: ORG_A,
    principalId: '22222222-2222-4222-8222-222222222222',
    portalKind: 'customer',
    clientId: '33333333-3333-4333-8333-333333333333',
    projectId: '44444444-4444-4444-8444-444444444444',
    vendorId: null,
    scopes: ['project.summary'],
    status: 'active',
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('portal tenant isolation', () => {
  it('rejects grants from another organization', () => {
    const grant = makeGrant({ organizationId: ORG_A });
    expect(grantMatchesOrganization(grant, ORG_A)).toBe(true);
    expect(grantMatchesOrganization(grant, ORG_B)).toBe(false);
    expect(() => assertGrantBelongsToOrganization(grant, ORG_B)).toThrow(DomainRuleError);
    expect(() => assertSameOrganization(ORG_A, ORG_B)).toThrow(/cross-tenant/i);
  });

  it('keeps customer session organizationId tied to the grant tenant', () => {
    const session = buildCustomerPortalSession({
      grant: makeGrant({ organizationId: ORG_A }),
      principalEmail: 'customer@external.test',
    });
    expect(session.organizationId).toBe(ORG_A);
    expect(session.kind).toBe('customer_portal');
    expect(session).not.toHaveProperty('membershipId');
  });

  it('blocks cross-vendor and cross-tenant vendor grant use', () => {
    const grant = makeGrant({
      portalKind: 'vendor',
      vendorId: '55555555-5555-4555-8555-555555555555',
      clientId: null,
      projectId: null,
      scopes: ['vendor.summary', 'po.view'],
      organizationId: ORG_A,
    });
    expect(() =>
      assertVendorGrantActive(grant, '66666666-6666-4666-8666-666666666666'),
    ).toThrow(DomainRuleError);

    const session = buildVendorPortalSession({
      grant,
      principalEmail: 'vendor@external.test',
    });
    expect(session.organizationId).toBe(ORG_A);
    expect(session.organizationId).not.toBe(ORG_B);
  });

  it('revoked grants cannot cover projects across customers', () => {
    const grant = makeGrant({
      status: 'revoked',
      revokedAt: new Date('2026-02-01'),
      projectId: 'project-a',
      clientId: 'client-a',
    });
    expect(grantIsActive(grant)).toBe(false);
    expect(
      grantCoversProject(
        { projectId: 'project-a', clientId: 'client-a' },
        { id: 'project-b', clientId: 'client-b' },
      ),
    ).toBe(false);
  });
});
