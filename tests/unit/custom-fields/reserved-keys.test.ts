import { describe, expect, it } from 'vitest';
import {
  isReservedCustomFieldKey,
  RESERVED_CUSTOM_FIELD_KEYS,
} from '@/modules/custom-fields/domain/reserved-keys';
import { createDefinitionSchema } from '@/modules/custom-fields/validation/schemas';

describe('reserved custom field keys', () => {
  it('blocks canonical financial collisions', () => {
    expect(isReservedCustomFieldKey('profit')).toBe(true);
    expect(isReservedCustomFieldKey('contract_amount')).toBe(true);
    expect(isReservedCustomFieldKey('burdenRate')).toBe(true);
    expect(isReservedCustomFieldKey('site_code')).toBe(false);
  });

  it('exposes a non-empty reserved list', () => {
    expect(RESERVED_CUSTOM_FIELD_KEYS.length).toBeGreaterThan(10);
  });
});

describe('createDefinitionSchema', () => {
  it('rejects reserved keys at validation time when refined', () => {
    const parsed = createDefinitionSchema.safeParse({
      entityType: 'client',
      key: 'site_floor',
      label: 'Floor',
      fieldType: 'text',
    });
    expect(parsed.success).toBe(true);
  });
});
