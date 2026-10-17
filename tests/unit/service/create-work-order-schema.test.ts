import { describe, expect, it } from 'vitest';
import { createWorkOrderSchema } from '@/modules/service/validation/schemas';

describe('createWorkOrderSchema price', () => {
  it('rejects a negative fixed price and keeps a non-negative amount', () => {
    const negative = createWorkOrderSchema.safeParse({
      name: 'Panel check',
      clientName: 'Walk-in Dana',
      pricingMode: 'fixed',
      priceAmount: '-12',
    });
    expect(negative.success).toBe(false);
    if (!negative.success) {
      expect(negative.error.issues.some((issue) => issue.message === 'validation.nonNegativeDecimalRequired')).toBe(
        true,
      );
    }

    const ok = createWorkOrderSchema.safeParse({
      name: 'Panel check',
      clientName: 'Walk-in Dana',
      pricingMode: 'fixed',
      priceAmount: '120',
    });
    expect(ok.success).toBe(true);
  });
});
