import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type {
  ApprovalRequestRecord,
  ApprovalRequestStepRecord,
} from '@/modules/approvals/domain/types';

const findApprovalRequestById = vi.fn();
const listRequestSteps = vi.fn();
const decideRequestStep = vi.fn();
const advanceApprovalRequestStep = vi.fn();
const updateApprovalRequestDecision = vi.fn();

vi.mock('@/modules/approvals/data/approvals.repository', () => ({
  findApprovalRequestById: (...args: unknown[]) => findApprovalRequestById(...args),
  listRequestSteps: (...args: unknown[]) => listRequestSteps(...args),
  decideRequestStep: (...args: unknown[]) => decideRequestStep(...args),
  advanceApprovalRequestStep: (...args: unknown[]) => advanceApprovalRequestStep(...args),
  updateApprovalRequestDecision: (...args: unknown[]) =>
    updateApprovalRequestDecision(...args),
}));

vi.mock('@/shared/audit', () => ({
  AUDIT_ACTIONS: {
    APPROVAL_REQUEST_APPROVED: 'approval.approved',
    APPROVAL_REQUEST_REJECTED: 'approval.rejected',
  },
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/modules/tenancy', () => ({
  noteModuleUsage: vi.fn(async () => undefined),
}));

import { decideApprovalRequest } from '@/modules/approvals/application/decide';

const REQUEST_ID = '01900000-0000-7000-8000-0000000000bb';
const MANAGER_USER = '01900000-0000-7000-8000-0000000000cc';
const FINANCE_USER = '01900000-0000-7000-8000-0000000000dd';

function contextFor(userId: string, roleKeys: string[]): OrgContext {
  return {
    userId,
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
    permissions: new Set([PERMISSIONS.APPROVALS_DECIDE]),
    roleKeys,
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function request(partial: Partial<ApprovalRequestRecord> = {}): ApprovalRequestRecord {
  return {
    id: REQUEST_ID,
    organizationId: 'org-1',
    ruleId: 'rule-1',
    entityType: 'expense',
    entityId: '01900000-0000-7000-8000-000000000001',
    amount: '5000',
    currency: 'ILS',
    status: 'submitted',
    submittedByUserId: 'submitter-1',
    decidedByUserId: null,
    decidedAt: null,
    decisionNote: null,
    currentStepOrder: 1,
    totalSteps: 2,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...partial,
  };
}

function step(partial: Partial<ApprovalRequestStepRecord>): ApprovalRequestStepRecord {
  return {
    id: partial.id ?? 'step-1',
    organizationId: 'org-1',
    requestId: REQUEST_ID,
    stepOrder: partial.stepOrder ?? 1,
    name: partial.name ?? 'Manager review',
    approverStrategy: partial.approverStrategy ?? 'role_template',
    roleTemplateKey: partial.roleTemplateKey ?? 'manager',
    permissionKey: partial.permissionKey ?? null,
    userId: partial.userId ?? null,
    status: partial.status ?? 'pending',
    decidedByUserId: partial.decidedByUserId ?? null,
    decidedAt: partial.decidedAt ?? null,
    decisionNote: partial.decisionNote ?? null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  };
}

describe('decideApprovalRequest uses immutable request step snapshots', () => {
  beforeEach(() => {
    findApprovalRequestById.mockReset();
    listRequestSteps.mockReset();
    decideRequestStep.mockReset();
    advanceApprovalRequestStep.mockReset();
    updateApprovalRequestDecision.mockReset();
    decideRequestStep.mockResolvedValue(step({ status: 'approved' }));
  });

  it('eligibility follows request step snapshot, not live rule edits', async () => {
    findApprovalRequestById.mockResolvedValue(request({ currentStepOrder: 1 }));
    listRequestSteps.mockResolvedValue([
      step({
        stepOrder: 1,
        approverStrategy: 'role_template',
        roleTemplateKey: 'manager',
        status: 'pending',
      }),
      step({
        id: 'step-2',
        stepOrder: 2,
        name: 'Finance review',
        approverStrategy: 'role_template',
        roleTemplateKey: 'finance',
        status: 'pending',
      }),
    ]);
    advanceApprovalRequestStep.mockResolvedValue(request({ currentStepOrder: 2 }));

    await decideApprovalRequest(contextFor(MANAGER_USER, ['manager']), {
      requestId: REQUEST_ID,
      decision: 'approved',
    });

    expect(decideRequestStep).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      REQUEST_ID,
      1,
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('blocks finance approver on step 1 when snapshot says manager', async () => {
    findApprovalRequestById.mockResolvedValue(request({ currentStepOrder: 1 }));
    listRequestSteps.mockResolvedValue([
      step({
        stepOrder: 1,
        approverStrategy: 'role_template',
        roleTemplateKey: 'manager',
        status: 'pending',
      }),
    ]);

    await expect(
      decideApprovalRequest(contextFor(FINANCE_USER, ['finance']), {
        requestId: REQUEST_ID,
        decision: 'approved',
      }),
    ).rejects.toMatchObject({ messageKey: 'approvals.errors.notEligible' });

    expect(decideRequestStep).not.toHaveBeenCalled();
  });

  it('reject ends the whole request', async () => {
    findApprovalRequestById.mockResolvedValue(request({ currentStepOrder: 1 }));
    listRequestSteps.mockResolvedValue([
      step({ stepOrder: 1, roleTemplateKey: 'manager', status: 'pending' }),
    ]);
    updateApprovalRequestDecision.mockResolvedValue(
      request({ status: 'rejected', decidedByUserId: MANAGER_USER }),
    );

    const result = await decideApprovalRequest(contextFor(MANAGER_USER, ['manager']), {
      requestId: REQUEST_ID,
      decision: 'rejected',
      decisionNote: 'Too high',
    });

    expect(result.status).toBe('rejected');
    expect(advanceApprovalRequestStep).not.toHaveBeenCalled();
  });
});

describe('decideApprovalRequest legacy 0-step rules', () => {
  beforeEach(() => {
    findApprovalRequestById.mockReset();
    listRequestSteps.mockReset();
    decideRequestStep.mockReset();
    updateApprovalRequestDecision.mockReset();
  });

  it('uses single decide path when totalSteps and currentStepOrder are null', async () => {
    findApprovalRequestById.mockResolvedValue(
      request({ currentStepOrder: null, totalSteps: null }),
    );
    updateApprovalRequestDecision.mockResolvedValue(
      request({
        status: 'approved',
        currentStepOrder: null,
        totalSteps: null,
        decidedByUserId: MANAGER_USER,
      }),
    );

    const result = await decideApprovalRequest(contextFor(MANAGER_USER, ['owner']), {
      requestId: REQUEST_ID,
      decision: 'approved',
    });

    expect(result.status).toBe('approved');
    expect(listRequestSteps).not.toHaveBeenCalled();
    expect(decideRequestStep).not.toHaveBeenCalled();
  });
});
