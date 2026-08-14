import { describe, expect, it } from 'vitest';
import {
  SEARCHABLE_CUSTOM_FIELD_TYPES,
  customFieldsMatchQuery,
  isSearchableCustomFieldType,
  searchableTextsFromCustomField,
  type SearchableCustomFieldPair,
} from '@/modules/custom-fields/domain/searchable';
import { CUSTOM_FIELD_TYPES } from '@/modules/custom-fields/domain/types';

function pair(
  fieldType: SearchableCustomFieldPair['definition']['fieldType'],
  key: string,
  value: SearchableCustomFieldPair['value'],
  archivedAt: Date | null = null,
): SearchableCustomFieldPair {
  return { definition: { fieldType, key, archivedAt }, value };
}

describe('searchable custom field types', () => {
  it('allows only text and select', () => {
    expect([...SEARCHABLE_CUSTOM_FIELD_TYPES]).toEqual(['text', 'select']);
    expect(isSearchableCustomFieldType('text')).toBe(true);
    expect(isSearchableCustomFieldType('select')).toBe(true);
    for (const fieldType of CUSTOM_FIELD_TYPES) {
      if (fieldType === 'text' || fieldType === 'select') continue;
      expect(isSearchableCustomFieldType(fieldType)).toBe(false);
    }
  });
});

describe('client custom field search matching', () => {
  it('finds a client by a custom text value when the name does not match', () => {
    const fields = [pair('text', 'site_code', { valueText: 'North Wing Building A' })];
    expect(customFieldsMatchQuery('north wing', fields)).toBe(true);
    expect(customFieldsMatchQuery('Building A', fields)).toBe(true);
  });

  it('finds a client by a select label', () => {
    const fields = [pair('select', 'account_tier', { valueText: 'Preferred' })];
    expect(customFieldsMatchQuery('prefer', fields)).toBe(true);
  });

  it('does not match when the query is unrelated', () => {
    const fields = [pair('text', 'site_code', { valueText: 'North Wing' })];
    expect(customFieldsMatchQuery('south', fields)).toBe(false);
  });

  it('excludes money-like values even if the amount also sits on valueText', () => {
    const money = pair('money', 'site_allowance', {
      valueText: '1500.00',
      valueNumber: '1500.00',
    });
    const number = pair('number', 'floor_count', { valueNumber: '12', valueText: '12' });
    expect(customFieldsMatchQuery('1500', [money])).toBe(false);
    expect(customFieldsMatchQuery('12', [number])).toBe(false);
    expect(searchableTextsFromCustomField(money.definition, money.value)).toEqual([]);
  });

  it('excludes reserved financial keys even if typed as text', () => {
    const profit = pair('text', 'profit', { valueText: 'secret-margin-tag' });
    const rate = pair('text', 'hourlyRate', { valueText: 'hidden-rate-code' });
    expect(customFieldsMatchQuery('secret-margin', [profit])).toBe(false);
    expect(customFieldsMatchQuery('hidden-rate', [rate])).toBe(false);
  });

  it('excludes archived definitions', () => {
    const fields = [
      pair('text', 'site_code', { valueText: 'North Wing' }, new Date('2026-01-01')),
    ];
    expect(customFieldsMatchQuery('north', fields)).toBe(false);
  });
});
