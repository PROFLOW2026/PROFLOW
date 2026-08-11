import { describe, expect, it } from 'vitest';
import {
  doesUsageCreatePurchaseActual,
  isEquipmentUsageRecognizedActual,
  isMaterialUsageRecognizedActual,
} from '@/modules/assets/domain/usage';

describe('usage ≠ Actual', () => {
  it('material usage never recognizes Actual', () => {
    expect(isMaterialUsageRecognizedActual()).toBe(false);
  });

  it('equipment usage never recognizes Actual', () => {
    expect(isEquipmentUsageRecognizedActual()).toBe(false);
  });

  it('usage never invents a second purchase Actual', () => {
    expect(doesUsageCreatePurchaseActual()).toBe(false);
  });
});
