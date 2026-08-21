import { describe, expect, it } from 'vitest';
import { assertConsecutiveStepOrders } from '@/modules/approvals/domain/steps';

describe('assertConsecutiveStepOrders', () => {
  it('accepts consecutive orders 1..n', () => {
    expect(() => assertConsecutiveStepOrders([1, 2, 3])).not.toThrow();
    expect(() => assertConsecutiveStepOrders([3, 1, 2])).not.toThrow();
  });

  it('rejects duplicate step orders', () => {
    expect(() => assertConsecutiveStepOrders([1, 1, 2])).toThrow(/duplicate stepOrder/i);
  });

  it('rejects gaps in step orders', () => {
    expect(() => assertConsecutiveStepOrders([1, 3])).toThrow(/consecutive stepOrder/i);
  });

  it('rejects orders not starting at 1', () => {
    expect(() => assertConsecutiveStepOrders([2, 3])).toThrow(/consecutive stepOrder/i);
  });

  it('allows empty input', () => {
    expect(() => assertConsecutiveStepOrders([])).not.toThrow();
  });
});
