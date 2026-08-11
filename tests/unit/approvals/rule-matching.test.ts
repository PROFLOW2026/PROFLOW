import { describe, expect, it } from 'vitest';
import {
  approvalCoversAmount,
  ruleMatchesAmount,
  selectMatchingRule,
} from '@/modules/approvals/domain/rules';
import type { ApprovalRuleRecord } from '@/modules/approvals/domain/types';

function rule(partial: Partial<ApprovalRuleRecord> & Pick<ApprovalRuleRecord, 'entityType'>): ApprovalRuleRecord {
  return {
    id: partial.id ?? 'rule-1',
    organizationId: 'org-1',
    name: partial.name ?? 'Rule',
    entityType: partial.entityType,
    thresholdAmount: partial.thresholdAmount ?? null,
    currency: partial.currency ?? null,
    enabled: partial.enabled ?? true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

describe('approval rule matching', () => {
  it('matches when amount is at or above threshold', () => {
    const r = rule({ entityType: 'expense', thresholdAmount: '1000', currency: 'ILS' });
    expect(ruleMatchesAmount(r, { entityType: 'expense', amount: '1000', currency: 'ILS' })).toBe(true);
    expect(ruleMatchesAmount(r, { entityType: 'expense', amount: '999.99', currency: 'ILS' })).toBe(false);
  });

  it('matches any amount when threshold is null', () => {
    const r = rule({ entityType: 'purchase_order', thresholdAmount: null, currency: 'ILS' });
    expect(ruleMatchesAmount(r, { entityType: 'purchase_order', amount: '1', currency: 'ILS' })).toBe(true);
  });

  it('ignores disabled rules and currency mismatches', () => {
    const disabled = rule({ entityType: 'expense', thresholdAmount: '10', currency: 'ILS', enabled: false });
    const usd = rule({ entityType: 'expense', thresholdAmount: '10', currency: 'USD' });
    expect(ruleMatchesAmount(disabled, { entityType: 'expense', amount: '100', currency: 'ILS' })).toBe(false);
    expect(ruleMatchesAmount(usd, { entityType: 'expense', amount: '100', currency: 'ILS' })).toBe(false);
  });

  it('selects the lowest matching threshold', () => {
    const selected = selectMatchingRule(
      [
        rule({ id: 'high', entityType: 'expense', thresholdAmount: '5000', currency: 'ILS' }),
        rule({ id: 'low', entityType: 'expense', thresholdAmount: '1000', currency: 'ILS' }),
        rule({ id: 'mid', entityType: 'expense', thresholdAmount: '2000', currency: 'ILS' }),
      ],
      { entityType: 'expense', amount: '2500', currency: 'ILS' },
    );
    expect(selected?.id).toBe('low');
  });
});

describe('approvalCoversAmount', () => {
  it('covers matching stored amount and currency', () => {
    expect(
      approvalCoversAmount({
        requestAmount: '1000.00',
        requestCurrency: 'ILS',
        currentAmount: '1000',
        currentCurrency: 'ils',
      }),
    ).toBe(true);
  });

  it('does not cover an approved amount after the entity amount changes', () => {
    expect(
      approvalCoversAmount({
        requestAmount: '1000',
        requestCurrency: 'ILS',
        currentAmount: '50000',
        currentCurrency: 'ILS',
      }),
    ).toBe(false);
  });

  it('does not treat a null stored amount as covering a later amount', () => {
    expect(
      approvalCoversAmount({
        requestAmount: null,
        requestCurrency: null,
        currentAmount: '1000',
        currentCurrency: 'ILS',
      }),
    ).toBe(false);
  });

  it('covers amount-less entities when both sides are empty', () => {
    expect(
      approvalCoversAmount({
        requestAmount: null,
        requestCurrency: null,
        currentAmount: null,
        currentCurrency: null,
      }),
    ).toBe(true);
  });
});
