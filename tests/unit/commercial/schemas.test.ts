import { describe, expect, it } from 'vitest';
import {
  createChangeRequestSchema,
  createQuoteVersionSchema,
  reverseChangeOrderSchema,
} from '@/modules/commercial/validation/schemas';

describe('commercial money validation', () => {
  it('rejects negative requested amounts', () => {
    const result = createChangeRequestSchema.safeParse({
      projectId: '00000000-0000-4000-8000-000000000001',
      title: 'Extra wiring',
      direction: 'addition',
      requestedAmount: '-500',
    });

    expect(result.success).toBe(false);
  });

  it('rejects negative quote line totals', () => {
    const result = createQuoteVersionSchema.safeParse({
      changeRequestId: '00000000-0000-4000-8000-000000000002',
      lines: [
        {
          description: 'Panel upgrade',
          lineTotal: '-1000',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty reversal reason', () => {
    const result = reverseChangeOrderSchema.safeParse({
      changeOrderId: '00000000-0000-4000-8000-000000000003',
      reason: '   ',
    });
    expect(result.success).toBe(false);
  });
});
