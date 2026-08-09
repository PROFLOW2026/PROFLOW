import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { resolveDefaultTaxRate, resolveTaxRateForDate } from '@/modules/tax';
import type { TaxRuleRecord } from '@/modules/tax';

const ISRAEL_PACK_RULES: TaxRuleRecord[] = [
  {
    id: '1',
    organizationId: null,
    countryCode: 'IL',
    key: 'il_vat_standard_2015',
    name: 'VAT (Israel) 17%',
    method: 'percentage',
    ratePercent: '17',
    validFrom: businessDate('2015-10-01'),
    validTo: businessDate('2024-12-31'),
    isDefault: true,
  },
  {
    id: '2',
    organizationId: null,
    countryCode: 'IL',
    key: 'il_vat_standard_2025',
    name: 'VAT (Israel) 18%',
    method: 'percentage',
    ratePercent: '18',
    validFrom: businessDate('2025-01-01'),
    validTo: null,
    isDefault: true,
  },
];

describe('resolveTaxRateForDate', () => {
  it('returns 17% on the last day of the old rate', () => {
    const result = resolveDefaultTaxRate(ISRAEL_PACK_RULES, businessDate('2024-12-31'));
    expect(result.resolved?.ratePercent).toBe('17');
    expect(result.resolved?.scope).toBe('country_pack');
  });

  it('returns 18% from the first day of the new rate', () => {
    const result = resolveDefaultTaxRate(ISRAEL_PACK_RULES, businessDate('2025-01-01'));
    expect(result.resolved?.ratePercent).toBe('18');
  });

  it('returns null before any rule is effective', () => {
    const result = resolveDefaultTaxRate(ISRAEL_PACK_RULES, businessDate('2015-09-30'));
    expect(result.resolved).toBeNull();
  });

  it('prefers organization rule over country pack for the same date', () => {
    const orgOverride: TaxRuleRecord = {
      id: '3',
      organizationId: 'org-1',
      countryCode: 'IL',
      key: 'org_vat_special',
      name: 'Org VAT 16%',
      method: 'percentage',
      ratePercent: '16',
      validFrom: businessDate('2024-06-01'),
      validTo: null,
      isDefault: true,
    };

    const rules = [...ISRAEL_PACK_RULES, orgOverride];
    const result = resolveDefaultTaxRate(rules, businessDate('2024-06-15'));

    expect(result.resolved?.ratePercent).toBe('16');
    expect(result.resolved?.scope).toBe('organization');
    expect(result.usedOrgOverride).toBe(true);
  });

  it('respects validTo on organization rules', () => {
    const orgRule: TaxRuleRecord = {
      id: '4',
      organizationId: 'org-1',
      countryCode: 'IL',
      key: 'org_vat_temp',
      name: 'Temporary 15%',
      method: 'percentage',
      ratePercent: '15',
      validFrom: businessDate('2024-01-01'),
      validTo: businessDate('2024-03-31'),
      isDefault: true,
    };

    const rules = [...ISRAEL_PACK_RULES, orgRule];

    expect(resolveDefaultTaxRate(rules, businessDate('2024-03-31')).resolved?.ratePercent).toBe('15');
    expect(resolveDefaultTaxRate(rules, businessDate('2024-04-01')).resolved?.ratePercent).toBe('17');
  });

  it('resolves a specific key when requested', () => {
    const result = resolveTaxRateForDate(ISRAEL_PACK_RULES, businessDate('2024-06-01'), {
      key: 'il_vat_standard_2015',
    });
    expect(result.resolved?.ratePercent).toBe('17');
  });

  it('picks the latest validFrom when ranges overlap within the same scope', () => {
    const overlapping: TaxRuleRecord[] = [
      {
        id: 'a',
        organizationId: 'org-1',
        countryCode: 'IL',
        key: 'org_vat',
        name: 'First',
        method: 'percentage',
        ratePercent: '10',
        validFrom: businessDate('2024-01-01'),
        validTo: businessDate('2024-12-31'),
        isDefault: true,
      },
      {
        id: 'b',
        organizationId: 'org-1',
        countryCode: 'IL',
        key: 'org_vat',
        name: 'Second',
        method: 'percentage',
        ratePercent: '12',
        validFrom: businessDate('2024-06-01'),
        validTo: businessDate('2024-12-31'),
        isDefault: true,
      },
    ];

    expect(resolveDefaultTaxRate(overlapping, businessDate('2024-05-31')).resolved?.ratePercent).toBe('10');
    expect(resolveDefaultTaxRate(overlapping, businessDate('2024-06-01')).resolved?.ratePercent).toBe('12');
  });
});
