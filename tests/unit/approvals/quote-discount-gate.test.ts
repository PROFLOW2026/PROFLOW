import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { ApprovalRequestRecord, ApprovalRuleRecord } from '@/modules/approvals/domain/types';
import { ruleMatchesAmount, selectMatchingRule } from '@/modules/approvals/domain/rules';

const listEnabledRulesForEntity = vi.fn();
const findLatestRequestForEntityGate = vi.fn();
const insertApprovalRequest = vi.fn();
const listRuleSteps = vi.fn(async () => []);
const insertApprovalRequestSteps = vi.fn(async () => undefined);

vi.mock('@/modules/approvals/data/approvals.repository', () => ({
  listEnabledRulesForEntity: (...args: unknown[]) => listEnabledRulesForEntity(...args),
  findLatestRequestForEntityGate: (...args: unknown[]) => findLatestRequestForEntityGate(...args),
  insertApprovalRequest: (...args: unknown[]) => insertApprovalRequest(...args),
  listRuleSteps: (...args: unknown[]) => listRuleSteps(...(args as [])),
  insertApprovalRequestSteps: (...args: unknown[]) =>
    insertApprovalRequestSteps(...(args as [])),
  findOpenRequestForEntity: vi.fn(),
}));

vi.mock('@/shared/audit', () => ({
  AUDIT_ACTIONS: { APPROVAL_REQUEST_SUBMITTED: 'approval.request_submitted' },
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/modules/tenancy', () => ({
  noteModuleUsage: vi.fn(async () => undefined),
}));

import { assertApprovalAllowsAction } from '@/modules/approvals/application/submit-and-gate';

const QUOTE_ID = '01900000-0000-7000-8000-000000000001';
const RULE_ID = '01900000-0000-7000-8000-0000000000aa';
const REQUEST_ID = '01900000-0000-7000-8000-0000000000bb';

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

function discountRule(partial: Partial<ApprovalRuleRecord> = {}): ApprovalRuleRecord {
  return {
    id: RULE_ID,
    organizationId: 'org-1',
    name: 'Large quote discount',
    entityType: 'quote_discount',
    thresholdAmount: '1000',
    currency: 'ILS',
    enabled: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...partial,
  };
}

function request(partial: Partial<ApprovalRequestRecord> = {}): ApprovalRequestRecord {
  return {
    id: REQUEST_ID,
    organizationId: 'org-1',
    ruleId: RULE_ID,
    entityType: 'quote_discount',
    entityId: QUOTE_ID,
    amount: '1500.000000',
    currency: 'ILS',
    status: 'submitted',
    submittedByUserId: 'user-1',
    decidedByUserId: null,
    decidedAt: null,
    decisionNote: null,
    currentStepOrder: null,
    totalSteps: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...partial,
  };
}

describe('quote_discount rule matching', () => {
  it('matches when the discount amount is at or above the money threshold', () => {
    const rule = discountRule();
    expect(
      ruleMatchesAmount(rule, {
        entityType: 'quote_discount',
        amount: '1000',
        currency: 'ILS',
      }),
    ).toBe(true);
    expect(
      ruleMatchesAmount(rule, {
        entityType: 'quote_discount',
        amount: '999.99',
        currency: 'ILS',
      }),
    ).toBe(false);
  });

  it('does not match a smaller discount or a disabled rule', () => {
    expect(
      selectMatchingRule([discountRule({ enabled: false })], {
        entityType: 'quote_discount',
        amount: '5000',
        currency: 'ILS',
      }),
    ).toBeNull();
    expect(
      selectMatchingRule([discountRule()], {
        entityType: 'quote_discount',
        amount: '50',
        currency: 'ILS',
      }),
    ).toBeNull();
  });
});

describe('assertApprovalAllowsAction quote_discount thresholds', () => {
  const actor = contextWith([PERMISSIONS.QUOTES_MANAGE]);

  beforeEach(() => {
    listEnabledRulesForEntity.mockReset();
    findLatestRequestForEntityGate.mockReset();
    insertApprovalRequest.mockReset();
  });

  it('allows issue when no quote_discount rule matches', async () => {
    listEnabledRulesForEntity.mockResolvedValue([]);
    await expect(
      assertApprovalAllowsAction(actor, {
        entityType: 'quote_discount',
        entityId: QUOTE_ID,
        amount: '1500.000000',
        currency: 'ILS',
        submitIfMissing: true,
      }),
    ).resolves.toBeUndefined();
    expect(insertApprovalRequest).not.toHaveBeenCalled();
  });

  it('blocks issue when a matching rule has no covering approval (submits pending)', async () => {
    listEnabledRulesForEntity.mockResolvedValue([discountRule()]);
    findLatestRequestForEntityGate.mockResolvedValue(null);
    insertApprovalRequest.mockResolvedValue(request());

    await expect(
      assertApprovalAllowsAction(actor, {
        entityType: 'quote_discount',
        entityId: QUOTE_ID,
        amount: '1500.000000',
        currency: 'ILS',
        submitIfMissing: true,
      }),
    ).rejects.toMatchObject({ messageKey: 'approvals.errors.submittedPending' });

    expect(insertApprovalRequest).toHaveBeenCalledWith(
      actor.db,
      expect.objectContaining({
        entityType: 'quote_discount',
        entityId: QUOTE_ID,
        amount: '1500.000000',
        currency: 'ILS',
        ruleId: RULE_ID,
      }),
    );
  });

  it('allows issue after an approved request covers the same discount', async () => {
    listEnabledRulesForEntity.mockResolvedValue([discountRule()]);
    findLatestRequestForEntityGate.mockResolvedValue(
      request({ status: 'approved', decidedByUserId: 'approver-1', decidedAt: new Date() }),
    );

    await expect(
      assertApprovalAllowsAction(actor, {
        entityType: 'quote_discount',
        entityId: QUOTE_ID,
        amount: '1500.000000',
        currency: 'ILS',
        submitIfMissing: true,
      }),
    ).resolves.toBeUndefined();
    expect(insertApprovalRequest).not.toHaveBeenCalled();
  });
});
