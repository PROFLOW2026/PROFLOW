import { describe, expect, it } from 'vitest';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import type { OrgContext } from '@/shared/auth/context';

function minimalContext(roleKeys: readonly string[]): OrgContext {
  return {
    roleKeys,
  } as OrgContext;
}

describe('isOrganizationOwner', () => {
  it('returns true when owner role is present', () => {
    expect(isOrganizationOwner(minimalContext(['owner']))).toBe(true);
    expect(isOrganizationOwner(minimalContext(['finance', 'owner']))).toBe(true);
  });

  it('returns false for non-owner roles', () => {
    expect(isOrganizationOwner(minimalContext(['finance']))).toBe(false);
    expect(isOrganizationOwner(minimalContext([]))).toBe(false);
  });
});
