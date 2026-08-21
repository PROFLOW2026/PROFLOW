import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import {
  assertOpsRecordKindLinkable,
  createLinkedExpenseFromOpsRecord,
  expenseStatusContributesToActual,
  finalizeLinkedOpsExpense,
  findActiveLinkForOpsRecord,
  isInventoryMovementFinancialExpense,
  isOpsRecordCostActual,
  mapOpsRecordToExpenseDraft,
  opsCostAloneExpenseContributions,
  resetOpsExpenseLinksStoreForTests,
  setOpsFinancePersistenceReadyForTests,
  shouldDeduplicateMaterialCostWithVendorRecognition,
} from '@/modules/ops-finance';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { money, zeroMoney } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

vi.mock('@/modules/ops-finance/application/load-ops-snapshot', () => ({
  loadOpsRecordCostSnapshot: vi.fn(async (_context: OrgContext, kind: string, id: string) => {
    if (kind === 'maintenance_record' && id === '01900000-0000-7000-8000-000000000111') {
      return {
        opsRecordKind: 'maintenance_record' as const,
        opsRecordId: id,
        costAmount: '1200.00',
        currency: 'ILS',
        title: 'Oil service',
        vendorId: null,
        projectId: '01900000-0000-7000-8000-000000000222',
        occurredOn: '2026-08-01',
        notes: null,
      };
    }
    if (kind === 'compliance_artifact' && id === '01900000-0000-7000-8000-000000000333') {
      return {
        opsRecordKind: 'compliance_artifact' as const,
        opsRecordId: id,
        costAmount: null,
        currency: null,
        title: 'Fleet insurance',
        vendorId: null,
        projectId: null,
        occurredOn: '2026-01-01',
        notes: null,
      };
    }
    if (kind === 'material_usage_record' && id === '01900000-0000-7000-8000-000000000601') {
      return {
        opsRecordKind: 'material_usage_record' as const,
        opsRecordId: id,
        costAmount: null,
        currency: null,
        title: 'Rebar bundle',
        vendorId: null,
        projectId: '01900000-0000-7000-8000-000000000222',
        occurredOn: '2026-08-14',
        notes: null,
      };
    }
    if (kind === 'equipment_usage_record' && id === '01900000-0000-7000-8000-000000000602') {
      return {
        opsRecordKind: 'equipment_usage_record' as const,
        opsRecordId: id,
        costAmount: null,
        currency: null,
        title: 'Equipment usage · Tower Crane',
        vendorId: null,
        projectId: '01900000-0000-7000-8000-000000000222',
        occurredOn: '2026-08-14',
        notes: null,
      };
    }
    throw new Error('not found in test double');
  }),
}));

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

const MAINTENANCE_ID = '01900000-0000-7000-8000-000000000111';
const PROJECT_ID = '01900000-0000-7000-8000-000000000222';
const COMPLIANCE_ID = '01900000-0000-7000-8000-000000000333';
const MATERIAL_USAGE_ID = '01900000-0000-7000-8000-000000000601';
const EQUIPMENT_USAGE_ID = '01900000-0000-7000-8000-000000000602';

describe('ops→finance hard rules', () => {
  it('ops record cost alone is never Actual', () => {
    expect(isOpsRecordCostActual()).toBe(false);
    expect(opsCostAloneExpenseContributions()).toEqual([]);
    expect(expenseStatusContributesToActual('draft')).toBe(false);
    expect(expenseStatusContributesToActual('finalized')).toBe(true);
  });

  it('inventory movement is never a financial expense; material costing must dedupe', () => {
    expect(isInventoryMovementFinancialExpense()).toBe(false);
    expect(shouldDeduplicateMaterialCostWithVendorRecognition()).toBe(true);
    expect(() => assertOpsRecordKindLinkable('inventory_movement')).toThrow(DomainRuleError);
  });
});

describe('maintenance 1200 alone → Actual unchanged; linked draft then finalize', () => {
  beforeEach(() => {
    setOpsFinancePersistenceReadyForTests(false);
    resetOpsExpenseLinksStoreForTests();
  });

  afterEach(() => {
    setOpsFinancePersistenceReadyForTests(null);
  });

  it('maintenance cost 1200 alone leaves Actual at 0', () => {
    const currency = 'ILS';
    // Ops cost metadata is not passed as expenseContributions (loader only uses finalized).
    const contributions = opsCostAloneExpenseContributions();
    const result = composeProjectFinancials({
      projectId: PROJECT_ID,
      currency,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: contributions,
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });
    expect(result.cost.actualCostToDate).toEqual(zeroMoney(currency));
    // Documented ops metadata amount is not in Actual.
    expect(money('1200', currency).amount).toBe('1200.000000');
  });

  it('explicit create linked expense → draft exists and is linked; Actual still 0', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const expenseId = '01900000-0000-7000-8000-000000000401';
    const createExpense = vi.fn(async () => ({ id: expenseId, status: 'draft' }));

    const created = await createLinkedExpenseFromOpsRecord(
      ctx,
      {
        opsRecordKind: 'maintenance_record',
        opsRecordId: MAINTENANCE_ID,
      },
      { createExpense },
    );

    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(created.expenseStatus).toBe('draft');
    expect(created.expenseId).toBe(expenseId);
    expect(created.expenseInput.amount).toBe('1200.00');
    expect(created.expenseInput.currency).toBe('ILS');

    const link = findActiveLinkForOpsRecord(
      ctx.organizationId,
      'maintenance_record',
      MAINTENANCE_ID,
    );
    expect(link?.expenseId).toBe(expenseId);

    // Drafts are not Actual contributions.
    expect(expenseStatusContributesToActual(created.expenseStatus)).toBe(false);
    const result = composeProjectFinancials({
      projectId: PROJECT_ID,
      currency: 'ILS',
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });
    expect(result.cost.actualCostToDate).toEqual(zeroMoney('ILS'));
  });

  it('finalize path delegates to existing finalizeExpense (no reimplementation)', async () => {
    const createCtx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const finalizeCtx = contextWith([PERMISSIONS.EXPENSES_FINALIZE]);
    const expenseId = '01900000-0000-7000-8000-000000000402';
    const createExpense = vi.fn(async () => ({ id: expenseId, status: 'draft' }));
    const finalizeExpense = vi.fn(async () => ({
      id: expenseId,
      status: 'finalized',
    }));

    await createLinkedExpenseFromOpsRecord(
      createCtx,
      { opsRecordKind: 'maintenance_record', opsRecordId: MAINTENANCE_ID },
      { createExpense },
    );

    const finalized = await finalizeLinkedOpsExpense(
      finalizeCtx,
      { expenseId },
      { finalizeExpense },
    );

    expect(finalizeExpense).toHaveBeenCalledTimes(1);
    expect(finalizeExpense).toHaveBeenCalledWith(finalizeCtx, expenseId);
    expect(finalized.expense.status).toBe('finalized');
    expect(expenseStatusContributesToActual(finalized.expense.status)).toBe(true);
  });

  it('rejects duplicate link for the same maintenance record', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    let n = 0;
    const createExpense = vi.fn(async () => {
      n += 1;
      return { id: `01900000-0000-7000-8000-00000000050${n}`, status: 'draft' };
    });

    await createLinkedExpenseFromOpsRecord(
      ctx,
      { opsRecordKind: 'maintenance_record', opsRecordId: MAINTENANCE_ID },
      { createExpense },
    );

    await expect(
      createLinkedExpenseFromOpsRecord(
        ctx,
        { opsRecordKind: 'maintenance_record', opsRecordId: MAINTENANCE_ID },
        { createExpense },
      ),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});

describe('insurance / compliance → draft with optional allocation fields', () => {
  beforeEach(() => {
    setOpsFinancePersistenceReadyForTests(false);
    resetOpsExpenseLinksStoreForTests();
  });

  afterEach(() => {
    setOpsFinancePersistenceReadyForTests(null);
  });

  it('maps insurance premium to overhead draft with allocation period', () => {
    const draft = mapOpsRecordToExpenseDraft({
      snapshot: {
        opsRecordKind: 'compliance_artifact',
        opsRecordId: COMPLIANCE_ID,
        costAmount: null,
        currency: null,
        title: 'Fleet insurance',
        vendorId: null,
        projectId: null,
        occurredOn: '2026-01-01',
        notes: null,
      },
      amount: '24000',
      currency: 'ILS',
      allocationPeriodStart: '2026-01-01',
      allocationPeriodEnd: '2026-12-31',
      allocationDriverMethod: 'contract_weight',
      allocationScheduleMode: 'annual',
    });

    expect(draft.costFamily).toBe('business_overhead');
    expect(draft.allocationDriverMethod).toBe('contract_weight');
    expect(draft.allocationScheduleMode).toBe('annual');
    expect(draft.amount).toBe('24000');
  });

  it('creates linked draft from compliance artifact with explicit amount', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const createExpense = vi.fn(async () => ({
      id: '01900000-0000-7000-8000-000000000403',
      status: 'draft',
    }));

    const created = await createLinkedExpenseFromOpsRecord(
      ctx,
      {
        opsRecordKind: 'compliance_artifact',
        opsRecordId: COMPLIANCE_ID,
        amount: '24000',
        currency: 'ILS',
        allocationPeriodStart: '2026-01-01',
        allocationPeriodEnd: '2026-12-31',
        allocationDriverMethod: 'contract_weight',
        allocationScheduleMode: 'annual',
      },
      { createExpense },
    );

    expect(created.link.linkPurpose).toBe('overhead_allocation');
    expect(created.expenseStatus).toBe('draft');
    expect(createExpense).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        amount: '24000',
        costFamily: 'business_overhead',
        allocationDriverMethod: 'contract_weight',
      }),
    );
  });
});

describe('usage records → draft only (no auto-Actual)', () => {
  beforeEach(() => {
    setOpsFinancePersistenceReadyForTests(false);
    resetOpsExpenseLinksStoreForTests();
  });

  afterEach(() => {
    setOpsFinancePersistenceReadyForTests(null);
  });

  it.each([
    ['material_usage_record', MATERIAL_USAGE_ID] as const,
    ['equipment_usage_record', EQUIPMENT_USAGE_ID] as const,
  ])('%s explicit link stays draft and blocks duplicate', async (kind, recordId) => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    let n = 0;
    const createExpense = vi.fn(async () => {
      n += 1;
      return { id: `01900000-0000-7000-8000-00000000070${n}`, status: 'draft' };
    });

    const created = await createLinkedExpenseFromOpsRecord(
      ctx,
      { opsRecordKind: kind, opsRecordId: recordId, amount: '1500', currency: 'ILS' },
      { createExpense },
    );

    expect(created.expenseStatus).toBe('draft');
    expect(expenseStatusContributesToActual(created.expenseStatus)).toBe(false);
    expect(createExpense).toHaveBeenCalledTimes(1);

    await expect(
      createLinkedExpenseFromOpsRecord(
        ctx,
        { opsRecordKind: kind, opsRecordId: recordId, amount: '1500', currency: 'ILS' },
        { createExpense },
      ),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
