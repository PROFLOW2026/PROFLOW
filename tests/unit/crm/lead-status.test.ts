import { describe, expect, it } from 'vitest';
import { updateLeadSchema } from '@/modules/crm/validation/schemas';
import { LEAD_STATUSES } from '@/modules/crm/domain/types';

describe('lead status updates', () => {
  it('accepts each lifecycle status for an existing lead', () => {
    const leadId = '33333333-3333-4333-8333-333333333333';
    for (const status of LEAD_STATUSES) {
      const parsed = updateLeadSchema.safeParse({ leadId, status });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects unknown lead status values', () => {
    const parsed = updateLeadSchema.safeParse({
      leadId: '33333333-3333-4333-8333-333333333333',
      status: 'archived',
    });
    expect(parsed.success).toBe(false);
  });
});
