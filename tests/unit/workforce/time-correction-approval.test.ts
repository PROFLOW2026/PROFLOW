import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import type { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { ApprovalRequestRecord, ApprovalRuleRecord } from '@/modules/approvals/domain/types';
import type { EmployeeRecord, TimeEntryRecord } from '@/modules/workforce/domain/types';
import {
  TIME_CORRECTION_AMOUNT_SENTINEL_RATE,
  resolveTimeCorrectionApprovalAmount,
} from '@/modules/workforce/domain/time-correction-approval';

const {
  listEnabledRulesForEntity,
  findLatestRequestForEntityGate,
  insertApprovalRequest,
  findEmployeeById,
  findTimeEntryById,
  findProjectById,
  findDefaultWorkPackage,
  listRateVersionsByEmployee,
  listComponentsByRateVersion,
  insertTimeEntry,
  voidTimeEntryRow,
  isMonthClosed,
  createClosedPeriodSourceCorrection,
  findNonProjectTimeCodeById,
} = vi.hoisted(() => ({
  listEnabledRulesForEntity: vi.fn(),
  findLatestRequestForEntityGate: vi.fn(),
  insertApprovalRequest: vi.fn(),
  findEmployeeById: vi.fn(),
  findTimeEntryById: vi.fn(),
  findProjectById: vi.fn(),
  findDefaultWorkPackage: vi.fn(),
  listRateVersionsByEmployee: vi.fn(),
  listComponentsByRateVersion: vi.fn(),
  insertTimeEntry: vi.fn(),
  voidTimeEntryRow: vi.fn(),
  isMonthClosed: vi.fn(async () => false),
  createClosedPeriodSourceCorrection: vi.fn(),
  findNonProjectTimeCodeById: vi.fn(),
}));

vi.mock('@/shared/db', () => ({
  withTransaction: vi.fn(async (db: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(db)),
}));

vi.mock('@/shared/audit', () => ({
  AUDIT_ACTIONS: {
    TIME_ENTRY_CREATED: 'time_entry.created',
    TIME_ENTRY_VOIDED: 'time_entry.voided',
    TIME_ENTRY_CORRECTED: 'time_entry.corrected',
    TIME_ENTRY_BULK_CREATED: 'time_entry.bulk_created',
    APPROVAL_REQUEST_SUBMITTED: 'approval_request.submitted',
  },
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/modules/tenancy', () => ({
  noteModuleUsage: vi.fn(async () => undefined),
}));

vi.mock('@/modules/projects/application/project-access', () => ({
  assertCanAccessProject: vi.fn(async () => undefined),
  resolveAccessibleProjectIds: vi.fn(async () => null),
  isAccessibleProjectId: () => true,
}));

vi.mock('@/modules/approvals/data/approvals.repository', () => ({
  listEnabledRulesForEntity,
  findLatestRequestForEntityGate,
  insertApprovalRequest,
  findOpenRequestForEntity: vi.fn(),
  findLatestRequestForEntity: vi.fn(),
  findApprovalRequestById: vi.fn(),
  listApprovalRulesForOrg: vi.fn(),
  insertApprovalRule: vi.fn(),
  updateApprovalRuleRow: vi.fn(),
  findApprovalRuleById: vi.fn(),
  listApprovalRequestsForOrg: vi.fn(),
  listPendingApprovalItems: vi.fn(),
  updateApprovalRequestDecision: vi.fn(),
  listRuleSteps: vi.fn(async () => []),
  insertApprovalRequestSteps: vi.fn(async () => undefined),
  listRequestSteps: vi.fn(async () => []),
  advanceApprovalRequestStep: vi.fn(),
  decideRequestStep: vi.fn(),
  replaceApprovalRuleSteps: vi.fn(),
  listApprovalRulesWithStepsForOrg: vi.fn(async () => []),
}));

vi.mock('@/modules/workforce/data/employees.repository', () => ({
  findEmployeeById,
  findEmployeeByUserId: vi.fn(),
}));

vi.mock('@/modules/workforce/data/project-refs.repository', () => ({
  findProjectById,
  findDefaultWorkPackage,
  findWorkPackageById: vi.fn(),
  findPhaseById: vi.fn(),
}));

vi.mock('@/modules/workforce/data/rate-versions.repository', () => ({
  listRateVersionsByEmployee,
  listComponentsByRateVersion,
}));

vi.mock('@/modules/workforce/data/time-entries.repository', () => ({
  findTimeEntryById,
  insertTimeEntry,
  voidTimeEntryRow,
  listTimeEntries: vi.fn(),
  sumProjectLaborCost: vi.fn(),
  countNonProjectTimeCodes: vi.fn(async () => 1),
  findNonProjectTimeCodeById,
  insertNonProjectTimeCode: vi.fn(),
  listNonProjectTimeCodes: vi.fn(),
}));

vi.mock('@/modules/month-close', () => ({
  isMonthClosed,
  createClosedPeriodSourceCorrection,
  assertMonthOpenForRewrite: vi.fn(async () => undefined),
  yearMonthFromBusinessDate: (date: string) => date.slice(0, 7),
}));

import { correctTimeEntry } from '@/modules/workforce/application/time-entries';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EMP_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const REPLACEMENT_ID = '44444444-4444-4444-8444-444444444444';
const RULE_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: USER_ID,
    organizationId: ORG_ID,
    membershipId: 'membership-1',
    organization: {
      id: ORG_ID,
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

function employee(): EmployeeRecord {
  return {
    id: EMP_ID,
    organizationId: ORG_ID,
    name: 'Worker',
    status: 'active',
    userId: USER_ID,
    employeeNumber: null,
    jobTitle: null,
    email: null,
    phone: null,
    notes: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function originalEntry(partial: Partial<TimeEntryRecord> = {}): TimeEntryRecord {
  return {
    id: ENTRY_ID,
    organizationId: ORG_ID,
    employeeId: EMP_ID,
    workDate: '2026-08-10',
    hours: '8',
    kind: 'project',
    projectId: PROJECT_ID,
    workPackageId: null,
    phaseId: null,
    timeCodeId: null,
    rateVersionId: null,
    costAmount: null,
    costCurrency: null,
    description: 'Original',
    createdByUserId: USER_ID,
    status: 'recorded',
    voidedAt: null,
    correctsEntryId: null,
    bulkBatchId: null,
    timesheetId: null,
    approvalStatus: 'approved',
    submittedAt: null,
    submittedByUserId: null,
    decidedAt: null,
    decidedByUserId: null,
    managerNote: null,
    archivedAt: null,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    ...partial,
  };
}

function matchingRule(): ApprovalRuleRecord {
  return {
    id: RULE_ID,
    organizationId: ORG_ID,
    name: 'Time corrections',
    entityType: 'time_correction',
    thresholdAmount: null,
    currency: 'ILS',
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function submittedRequest(amount: string): ApprovalRequestRecord {
  return {
    id: REQUEST_ID,
    organizationId: ORG_ID,
    ruleId: RULE_ID,
    entityType: 'time_correction',
    entityId: ENTRY_ID,
    amount,
    currency: 'ILS',
    status: 'submitted',
    submittedByUserId: USER_ID,
    decidedByUserId: null,
    decidedAt: null,
    decisionNote: null,
    currentStepOrder: null,
    totalSteps: null,
    createdAt: new Date('2026-08-14T00:00:00.000Z'),
    updatedAt: new Date('2026-08-14T00:00:00.000Z'),
  };
}

const correctionInput = {
  correctsEntryId: ENTRY_ID,
  employeeId: EMP_ID,
  workDate: businessDate('2026-08-10'),
  hours: '6',
  kind: 'project' as const,
  projectId: PROJECT_ID,
  description: 'Fixed hours',
};

function stubHappyPathLookups() {
  findEmployeeById.mockResolvedValue(employee());
  findTimeEntryById.mockResolvedValue(originalEntry());
  findProjectById.mockResolvedValue({ id: PROJECT_ID, name: 'Site', currency: 'ILS' });
  findDefaultWorkPackage.mockResolvedValue(null);
  listRateVersionsByEmployee.mockResolvedValue([]);
  listComponentsByRateVersion.mockResolvedValue([]);
  voidTimeEntryRow.mockImplementation(async (_db, _org, id, voidedAt: Date) => ({
    ...originalEntry(),
    status: 'void' as const,
    voidedAt,
    id,
  }));
  insertTimeEntry.mockImplementation(async (_db, input: Record<string, unknown>) => ({
    ...originalEntry(),
    id: REPLACEMENT_ID,
    hours: String(input.hours),
    description: (input.description as string | null) ?? null,
    costAmount: (input.costAmount as string | null) ?? null,
    costCurrency: (input.costCurrency as string | null) ?? null,
    rateVersionId: (input.rateVersionId as string | null) ?? null,
    correctsEntryId: (input.correctsEntryId as string | null) ?? null,
    status: 'recorded' as const,
    voidedAt: null,
  }));
}

describe('resolveTimeCorrectionApprovalAmount', () => {
  it('uses replacement cost_amount when known', () => {
    expect(
      resolveTimeCorrectionApprovalAmount({
        costAmount: '960.000000',
        costCurrency: 'ILS',
        hours: '8',
        orgBaseCurrency: 'USD',
      }),
    ).toEqual({ amount: '960.000000', currency: 'ILS' });
  });

  it('falls back to hours × sentinel in org base currency', () => {
    expect(TIME_CORRECTION_AMOUNT_SENTINEL_RATE).toBe('1');
    expect(
      resolveTimeCorrectionApprovalAmount({
        costAmount: null,
        costCurrency: null,
        hours: '6',
        orgBaseCurrency: 'ILS',
      }),
    ).toEqual({ amount: '6.000000', currency: 'ILS' });
  });
});

describe('correctTimeEntry approval gate', () => {
  const context = contextWith([PERMISSIONS.TIME_MANAGE, PERMISSIONS.WORKFORCE_READ]);

  beforeEach(() => {
    vi.clearAllMocks();
    stubHappyPathLookups();
    isMonthClosed.mockResolvedValue(false);
    listEnabledRulesForEntity.mockResolvedValue([]);
    findLatestRequestForEntityGate.mockResolvedValue(null);
    insertApprovalRequest.mockResolvedValue(submittedRequest('6.000000'));
  });

  it('applies void+replacement when no matching rule exists', async () => {
    const result = await correctTimeEntry(context, correctionInput);

    expect(insertApprovalRequest).not.toHaveBeenCalled();
    expect(voidTimeEntryRow).toHaveBeenCalledTimes(1);
    expect(insertTimeEntry).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe('void_replace');
    if (result.mode !== 'void_replace') throw new Error('expected void_replace');
    expect(result.voided.status).toBe('void');
    expect(result.voided.id).toBe(ENTRY_ID);
    expect(result.replacement.id).toBe(REPLACEMENT_ID);
    expect(result.replacement.correctsEntryId).toBe(ENTRY_ID);
    expect(result.replacement.hours).toBe('6');
  });

  it('blocks Actual mutation and creates a request when a rule matches without approval', async () => {
    listEnabledRulesForEntity.mockResolvedValue([matchingRule()]);
    insertApprovalRequest.mockImplementation(async (_db, input) => submittedRequest(String(input.amount)));

    await expect(correctTimeEntry(context, correctionInput)).rejects.toMatchObject({
      messageKey: 'approvals.errors.submittedPending',
    } satisfies Partial<DomainRuleError>);

    expect(insertApprovalRequest).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({
        entityType: 'time_correction',
        entityId: ENTRY_ID,
        amount: '6.000000',
        currency: 'ILS',
        ruleId: RULE_ID,
        submittedByUserId: USER_ID,
      }),
    );
    expect(voidTimeEntryRow).not.toHaveBeenCalled();
    expect(insertTimeEntry).not.toHaveBeenCalled();
  });

  it('applies the correction after the matching request is approved', async () => {
    const amount = '6.000000';
    listEnabledRulesForEntity.mockResolvedValue([matchingRule()]);
    findLatestRequestForEntityGate.mockResolvedValue({
      ...submittedRequest(amount),
      status: 'approved',
      decidedByUserId: USER_ID,
      decidedAt: new Date('2026-08-14T12:00:00.000Z'),
    });

    const result = await correctTimeEntry(context, correctionInput);

    expect(insertApprovalRequest).not.toHaveBeenCalled();
    expect(voidTimeEntryRow).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe('void_replace');
    if (result.mode !== 'void_replace') throw new Error('expected void_replace');
    expect(result.voided.status).toBe('void');
    expect(result.replacement.correctsEntryId).toBe(ENTRY_ID);
    expect(result.replacement.hours).toBe('6');
  });

  it('uses replacement cost_amount for the rule when a rate snapshot exists', async () => {
    listRateVersionsByEmployee.mockResolvedValue([
      {
        id: '77777777-7777-4777-8777-777777777777',
        organizationId: ORG_ID,
        employeeId: EMP_ID,
        validFrom: '2026-01-01',
        validTo: null,
        baseRate: '100',
        rateUnit: 'hourly',
        currency: 'ILS',
        burdenPercent: null,
        correctsRateVersionId: null,
        notes: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    listEnabledRulesForEntity.mockResolvedValue([matchingRule()]);

    await expect(correctTimeEntry(context, correctionInput)).rejects.toMatchObject({
      messageKey: 'approvals.errors.submittedPending',
    });

    expect(insertApprovalRequest).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({
        entityType: 'time_correction',
        entityId: ENTRY_ID,
        amount: '600.000000',
        currency: 'ILS',
      }),
    );
    expect(voidTimeEntryRow).not.toHaveBeenCalled();
  });

  it('does not void the original when the work-date month is closed; posts a cost adjustment instead', async () => {
    const ADJUSTMENT_ID = '88888888-8888-4888-8888-888888888888';
    isMonthClosed.mockResolvedValue(true);
    findTimeEntryById.mockResolvedValue(
      originalEntry({ costAmount: '800.000000', costCurrency: 'ILS' }),
    );
    listRateVersionsByEmployee.mockResolvedValue([
      {
        id: '77777777-7777-4777-8777-777777777777',
        organizationId: ORG_ID,
        employeeId: EMP_ID,
        validFrom: '2026-01-01',
        validTo: null,
        baseRate: '100',
        rateUnit: 'hourly',
        currency: 'ILS',
        burdenPercent: null,
        correctsRateVersionId: null,
        notes: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    createClosedPeriodSourceCorrection.mockResolvedValue({ id: ADJUSTMENT_ID });

    const result = await correctTimeEntry(context, correctionInput);

    expect(result).toEqual({
      mode: 'closed_period_adjustment',
      original: expect.objectContaining({ id: ENTRY_ID, status: 'recorded' }),
      adjustmentId: ADJUSTMENT_ID,
    });
    expect(voidTimeEntryRow).not.toHaveBeenCalled();
    expect(insertTimeEntry).not.toHaveBeenCalled();
    expect(createClosedPeriodSourceCorrection).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        yearMonth: '2026-08',
        effectSide: 'cost',
        projectId: PROJECT_ID,
        entityType: 'time_entry',
        entityId: ENTRY_ID,
        amount: '-200.000000',
        currency: 'ILS',
      }),
    );
  });

  it('refuses a closed-month correction without a project', async () => {
    const TIME_CODE_ID = '99999999-9999-4999-8999-999999999999';
    isMonthClosed.mockResolvedValue(true);
    findTimeEntryById.mockResolvedValue(
      originalEntry({ projectId: null, kind: 'non_project', timeCodeId: TIME_CODE_ID }),
    );
    findNonProjectTimeCodeById.mockResolvedValue({ id: TIME_CODE_ID, key: 'admin', name: 'Admin' });

    await expect(
      correctTimeEntry(context, {
        ...correctionInput,
        kind: 'non_project',
        projectId: null,
        timeCodeId: TIME_CODE_ID,
      }),
    ).rejects.toMatchObject({
      messageKey: 'workforce.errors.closedMonthNeedsProject',
    });
    expect(voidTimeEntryRow).not.toHaveBeenCalled();
    expect(createClosedPeriodSourceCorrection).not.toHaveBeenCalled();
  });
});

describe('time correction bypass and completeness invariants (source)', () => {
  it('gates correctTimeEntry before voiding so Labor Actual cannot change while pending', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../../src/modules/workforce/application/time-entries.ts', import.meta.url),
        'utf8',
      ),
    );
    const fnStart = source.indexOf('export async function correctTimeEntry');
    const gateAt = source.indexOf('assertTimeCorrectionAllowed', fnStart);
    const voidAt = source.indexOf('voidTimeEntryRow', fnStart);
    expect(source).toContain("entityType: 'time_correction'");
    expect(source).toContain('assertApprovalAllowsAction');
    expect(gateAt).toBeGreaterThan(fnStart);
    expect(voidAt).toBeGreaterThan(gateAt);

    const createStart = source.indexOf('export async function createTimeEntry');
    const bulkStart = source.indexOf('export async function createBulkTimeEntries');
    expect(source.slice(createStart, bulkStart)).not.toContain('correctsEntryId');
  });

  it('has no other time-entry void/replace/update API besides correctTimeEntry', async () => {
    const repo = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../../src/modules/workforce/data/time-entries.repository.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(repo).toContain('voidTimeEntryRow');
    expect(repo).not.toMatch(/\.update\(timeEntries\)[\s\S]*hours:/);
  });

  it('month-close completeness still counts submitted time_correction requests', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../../src/modules/month-close/data/completeness.repository.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(source).toContain("r.entity_type = 'time_correction'");
    expect(source).toContain("r.status = 'submitted'");
    expect(source).toContain('INNER JOIN time_entries te');
    expect(source).toContain("key: 'open_time_corrections'");
    expect(source).toContain('FROM time_entries te');
    expect(source).toContain("d.status = 'complete'");
  });
});
