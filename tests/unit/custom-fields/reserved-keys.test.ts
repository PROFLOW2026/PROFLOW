import { describe, expect, it } from 'vitest';
import {
  assertCustomFieldKeyAllowed,
  isReservedCustomFieldKey,
} from '@/modules/custom-fields/domain/reserved-keys';

describe('governed custom field keys', () => {
  it('blocks canonical financial keys', () => {
    expect(isReservedCustomFieldKey('contractAmount')).toBe(true);
    expect(isReservedCustomFieldKey('profit')).toBe(true);
    expect(isReservedCustomFieldKey('outstanding')).toBe(true);
    expect(() => assertCustomFieldKeyAllowed('tax_amount')).toThrow(/reserved/i);
  });

  it('allows non-colliding keys', () => {
    expect(isReservedCustomFieldKey('site_access_code')).toBe(false);
    expect(() => assertCustomFieldKeyAllowed('preferred_contact')).not.toThrow();
  });
});
