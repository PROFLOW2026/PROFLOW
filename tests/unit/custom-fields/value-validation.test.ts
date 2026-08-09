import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertCustomFieldValueValid,
  assertSelectOptionsConfig,
  parseSelectOptions,
} from '@/modules/custom-fields/domain/validate-value';
import { isReservedCustomFieldKey } from '@/modules/custom-fields/domain/reserved-keys';

describe('custom field value validation', () => {
  it('requires options for select definitions', () => {
    expect(() => assertSelectOptionsConfig('select', {})).toThrow(DomainRuleError);
    expect(() => assertSelectOptionsConfig('select', { options: ['A', 'B'] })).not.toThrow();
    expect(() => assertSelectOptionsConfig('text', {})).not.toThrow();
  });

  it('parses select options from config', () => {
    expect(parseSelectOptions({ options: [' Red ', '', 'Blue'] })).toEqual(['Red', 'Blue']);
  });

  it('enforces required values', () => {
    expect(() =>
      assertCustomFieldValueValid(
        { fieldType: 'text', required: true, config: {}, label: 'Site' },
        { valueText: null },
      ),
    ).toThrow(DomainRuleError);

    expect(() =>
      assertCustomFieldValueValid(
        { fieldType: 'text', required: true, config: {}, label: 'Site' },
        { valueText: 'Floor 2' },
      ),
    ).not.toThrow();
  });

  it('rejects select values outside options', () => {
    expect(() =>
      assertCustomFieldValueValid(
        {
          fieldType: 'select',
          required: false,
          config: { options: ['A', 'B'] },
          label: 'Color',
        },
        { valueText: 'C' },
      ),
    ).toThrow(DomainRuleError);
  });

  it('validates multi_select against options', () => {
    expect(() =>
      assertCustomFieldValueValid(
        {
          fieldType: 'multi_select',
          required: true,
          config: { options: ['A', 'B'] },
          label: 'Tags',
        },
        { valueJson: ['A', 'B'] },
      ),
    ).not.toThrow();

    expect(() =>
      assertCustomFieldValueValid(
        {
          fieldType: 'multi_select',
          required: true,
          config: { options: ['A', 'B'] },
          label: 'Tags',
        },
        { valueJson: ['A', 'Z'] },
      ),
    ).toThrow(DomainRuleError);
  });

  it('never allows reserved financial or status keys', () => {
    expect(isReservedCustomFieldKey('status')).toBe(true);
    expect(isReservedCustomFieldKey('billing_status')).toBe(true);
    expect(isReservedCustomFieldKey('contract_amount')).toBe(true);
    expect(isReservedCustomFieldKey('site_code')).toBe(false);
  });
});
