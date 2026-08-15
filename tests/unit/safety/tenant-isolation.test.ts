import { describe, expect, it } from 'vitest';
import { requireOrgRow, selectOrgRows } from '@/modules/safety';
import { NotFoundError } from '@/shared/errors';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

describe('safety tenant isolation', () => {
  it('selectOrgRows drops other-organization rows', () => {
    const rows = [
      { id: '1', organizationId: ORG_A },
      { id: '2', organizationId: ORG_B },
      { id: '3', organizationId: ORG_A },
    ];
    expect(selectOrgRows(rows, ORG_A).map((row) => row.id)).toEqual(['1', '3']);
  });

  it('requireOrgRow treats a foreign-org row as not found', () => {
    expect(() =>
      requireOrgRow({ id: '1', organizationId: ORG_B }, ORG_A, 'Safety record'),
    ).toThrow(NotFoundError);
    expect(requireOrgRow({ id: '1', organizationId: ORG_A }, ORG_A, 'Safety record').id).toBe('1');
  });
});
