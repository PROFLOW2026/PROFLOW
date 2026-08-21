import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { QuoteRecord } from '@/modules/quotes/domain/types';

const findQuoteById = vi.fn();
const updateQuoteById = vi.fn();
const assertApprovalAllowsAction = vi.fn();

vi.mock('@/modules/quotes/data/quotes.repository', () => ({
  findQuoteById: (...args: unknown[]) => findQuoteById(...args),
  updateQuoteById: (...args: unknown[]) => updateQuoteById(...args),
}));

vi.mock('@/modules/approvals', () => ({
  assertApprovalAllowsAction: (...args: unknown[]) => assertApprovalAllowsAction(...args),
}));

vi.mock('@/shared/audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/modules/tenancy', () => ({
  noteModuleUsage: vi.fn(async () => undefined),
}));

vi.mock('@/modules/branding', () => ({
  captureBrandSnapshot: vi.fn(async () => undefined),
}));

import { transitionQuoteStatus } from '@/modules/quotes/application/transition-quote';
import {
  isQuoteDiscountGateTransition,
  quoteDiscountAmountForApproval,
} from '@/modules/quotes/domain/discount';
import { createQuoteSchema } from '@/modules/quotes/validation/schemas';

const QUOTE_ID = '01900000-0000-7000-8000-000000000001';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function quote(partial: Partial<QuoteRecord> = {}): QuoteRecord {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: QUOTE_ID,
    organizationId: 'org-1',
    clientId: null,
    contactId: null,
    title: 'Kitchen',
    description: null,
    status: 'draft',
    currency: 'ILS',
    taxMode: 'exclusive',
    taxRuleId: null,
    validityDate: null,
    notes: null,
    subtotalAmount: '10000.000000',
    taxAmount: '1700.000000',
    totalAmount: '11700.000000',
    estimatedCostAmount: '7000.000000',
    estimatedMarginPercent: '30.000000',
    discountAmount: null,
    listSubtotalAmount: null,
    discountPercent: null,
    convertedProjectId: null,
    opportunityId: null,
    convertedAt: null,
    sentAt: null,
    decidedAt: null,
    createdByUserId: 'user-1',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('quote discount semantics', () => {
  it('prefers explicit discount amount for the money-threshold rule', () => {
    expect(
      quoteDiscountAmountForApproval({
        currency: 'ILS',
        subtotalAmount: '10000',
        totalAmount: '11700',
        discountAmount: '1500',
      }),
    ).toEqual({ amount: '1500.000000', currency: 'ILS' });
  });

  it('uses list subtotal minus quoted subtotal when no explicit discount is stored', () => {
    expect(
      quoteDiscountAmountForApproval({
        currency: 'ILS',
        subtotalAmount: '8000',
        totalAmount: '9360',
        listSubtotalAmount: '10000',
      }),
    ).toEqual({ amount: '2000.000000', currency: 'ILS' });
  });

  it('uses quoted total when a discount percent is present but no money discount', () => {
    expect(
      quoteDiscountAmountForApproval({
        currency: 'ILS',
        subtotalAmount: '8000',
        totalAmount: '9360',
        discountPercent: '20',
      }),
    ).toEqual({ amount: '9360.000000', currency: 'ILS' });
  });

  it('returns null when no discount exists (cost/margin is not a discount)', () => {
    expect(
      quoteDiscountAmountForApproval({
        currency: 'ILS',
        subtotalAmount: '10000',
        totalAmount: '11700',
      }),
    ).toBeNull();
    expect(
      quoteDiscountAmountForApproval({
        currency: 'ILS',
        subtotalAmount: '10000',
        totalAmount: '11700',
        discountAmount: '0',
        discountPercent: '0',
      }),
    ).toBeNull();
  });

  it('gates only the customer-facing sent lock', () => {
    expect(isQuoteDiscountGateTransition('sent')).toBe(true);
    expect(isQuoteDiscountGateTransition('ready')).toBe(false);
    expect(isQuoteDiscountGateTransition('accepted')).toBe(false);
    expect(isQuoteDiscountGateTransition('cancelled')).toBe(false);
  });

  it('accepts stored discount columns on create/update schemas', () => {
    const created = createQuoteSchema.parse({
      title: 'Kitchen',
      lines: [{ description: 'Install', quantity: '1', unitPriceAmount: '10000' }],
      discountAmount: '1500',
      listSubtotalAmount: '11500',
      discountPercent: '13',
    });
    expect(created.discountAmount).toBe('1500');
    expect(created.listSubtotalAmount).toBe('11500');
    expect(created.discountPercent).toBe('13');
  });
});

describe('transitionQuoteStatus quote_discount gate', () => {
  beforeEach(() => {
    findQuoteById.mockReset();
    updateQuoteById.mockReset();
    assertApprovalAllowsAction.mockReset();
    assertApprovalAllowsAction.mockResolvedValue(undefined);
  });

  it('requires quotes.manage before issue', async () => {
    const reader = contextWith([PERMISSIONS.QUOTES_READ]);
    await expect(
      transitionQuoteStatus(reader, { quoteId: QUOTE_ID, toStatus: 'sent' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(findQuoteById).not.toHaveBeenCalled();
    expect(assertApprovalAllowsAction).not.toHaveBeenCalled();
  });

  it('does not call the gate when no discount is present (existing behavior)', async () => {
    const manager = contextWith([PERMISSIONS.QUOTES_MANAGE]);
    const draft = quote();
    const sent = quote({ status: 'sent', sentAt: new Date() });
    findQuoteById.mockResolvedValue(draft);
    updateQuoteById.mockResolvedValue(sent);

    await expect(
      transitionQuoteStatus(manager, { quoteId: QUOTE_ID, toStatus: 'sent' }),
    ).resolves.toMatchObject({ status: 'sent' });

    expect(assertApprovalAllowsAction).not.toHaveBeenCalled();
    expect(updateQuoteById).toHaveBeenCalledTimes(1);
  });

  it('does not gate ready or cancel even when a large discount exists', async () => {
    const manager = contextWith([PERMISSIONS.QUOTES_MANAGE]);
    const draft = quote({ discountAmount: '5000.000000' });
    findQuoteById.mockResolvedValue(draft);
    updateQuoteById.mockResolvedValue(quote({ status: 'ready' }));

    await transitionQuoteStatus(manager, { quoteId: QUOTE_ID, toStatus: 'ready' });
    expect(assertApprovalAllowsAction).not.toHaveBeenCalled();
  });

  it('blocks issue when a matching quote_discount rule rejects via the gate', async () => {
    const manager = contextWith([PERMISSIONS.QUOTES_MANAGE]);
    findQuoteById.mockResolvedValue(quote({ discountAmount: '1500.000000' }));
    assertApprovalAllowsAction.mockRejectedValue(
      new DomainRuleError(
        'Submitted for approval - waiting for a decision',
        'approvals.errors.submittedPending',
        { entityType: 'quote_discount', entityId: QUOTE_ID },
      ),
    );

    await expect(
      transitionQuoteStatus(manager, { quoteId: QUOTE_ID, toStatus: 'sent' }),
    ).rejects.toMatchObject({ messageKey: 'approvals.errors.submittedPending' });

    expect(assertApprovalAllowsAction).toHaveBeenCalledWith(manager, {
      entityType: 'quote_discount',
      entityId: QUOTE_ID,
      amount: '1500.000000',
      currency: 'ILS',
      submitIfMissing: true,
    });
    expect(updateQuoteById).not.toHaveBeenCalled();
  });

  it('allows issue after the gate approves a matching discount', async () => {
    const manager = contextWith([PERMISSIONS.QUOTES_MANAGE]);
    const draft = quote({ discountAmount: '1500.000000' });
    const sent = quote({ status: 'sent', discountAmount: '1500.000000', sentAt: new Date() });
    findQuoteById.mockResolvedValue(draft);
    updateQuoteById.mockResolvedValue(sent);
    assertApprovalAllowsAction.mockResolvedValue(undefined);

    await expect(
      transitionQuoteStatus(manager, { quoteId: QUOTE_ID, toStatus: 'sent' }),
    ).resolves.toMatchObject({ status: 'sent' });

    expect(assertApprovalAllowsAction).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        entityType: 'quote_discount',
        amount: '1500.000000',
        currency: 'ILS',
      }),
    );
    expect(updateQuoteById).toHaveBeenCalledTimes(1);
  });
});
