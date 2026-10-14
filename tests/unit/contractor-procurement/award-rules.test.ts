import { describe, expect, it } from 'vitest';
import { assertPackageAwardable } from '@/modules/contractor-procurement/domain/award-rules';
import type { TenderPackageRow } from '@/modules/contractor-procurement/domain/types';

function pkg(status: TenderPackageRow['status']): TenderPackageRow {
  return {
    id: 'p1',
    organizationId: 'o1',
    projectId: 'proj1',
    tradeKey: 'electrical',
    title: 'Package',
    scopeDescription: null,
    workPackageId: null,
    status,
    awardedVendorId: null,
    awardedAgreementId: null,
  };
}

describe('assertPackageAwardable', () => {
  it('allows inviting and evaluating', () => {
    expect(() => assertPackageAwardable(pkg('inviting'))).not.toThrow();
    expect(() => assertPackageAwardable(pkg('evaluating'))).not.toThrow();
  });

  it('rejects draft and awarded', () => {
    expect(() => assertPackageAwardable(pkg('draft'))).toThrow();
    expect(() => assertPackageAwardable(pkg('awarded'))).toThrow();
  });
});
