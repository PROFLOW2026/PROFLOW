import { describe, expect, it } from 'vitest';
import {
  canAcceptSalesQuoteVersion,
  canIssueSalesQuoteVersion,
  isSalesQuoteVersionMutable,
  salesQuoteStatusAfterAccept,
  salesQuoteStatusAfterIssue,
  shouldSupersedeOnNewVersion,
} from '@/modules/crm/domain/sales-quote-version-rules';

describe('CRM sales quote version rules', () => {
  it('allows edits only in draft', () => {
    expect(isSalesQuoteVersionMutable('draft')).toBe(true);
    expect(isSalesQuoteVersionMutable('issued')).toBe(false);
    expect(isSalesQuoteVersionMutable('accepted')).toBe(false);
  });

  it('issues only from draft and accepts draft or issued', () => {
    expect(canIssueSalesQuoteVersion({ status: 'draft' })).toBe(true);
    expect(canIssueSalesQuoteVersion({ status: 'issued' })).toBe(false);
    expect(canAcceptSalesQuoteVersion({ status: 'draft' })).toBe(true);
    expect(canAcceptSalesQuoteVersion({ status: 'issued' })).toBe(true);
    expect(canAcceptSalesQuoteVersion({ status: 'superseded' })).toBe(false);
  });

  it('supersedes prior draft/issued appropriately and sets quote accepted', () => {
    expect(shouldSupersedeOnNewVersion('draft')).toBe(true);
    expect(shouldSupersedeOnNewVersion('issued')).toBe(true);
    expect(shouldSupersedeOnNewVersion('accepted')).toBe(false);
    expect(salesQuoteStatusAfterAccept()).toBe('accepted');
    expect(salesQuoteStatusAfterIssue('draft')).toBe('issued');
    expect(salesQuoteStatusAfterIssue('accepted')).toBe('accepted');
  });
});
