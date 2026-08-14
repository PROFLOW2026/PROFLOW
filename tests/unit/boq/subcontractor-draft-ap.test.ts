import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, ConflictError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import {
  isRecognizedVendorBillStatus,
  isVendorBillExcludedFromActual,
  RECOGNIZED_VENDOR_BILL_STATUSES,
} from '@/modules/ap/domain/vendor-cost-recognition';

const findSubcontractorValuationById = vi.fn();
const findSubcontractorScheduleById = vi.fn();
const listSubcontractorValuationLines = vi.fn();
const proposeSubcontractorValuationApRpc = vi.fn();
const findVendorEngagementById = vi.fn();
const createDraftApBill = vi.fn();

vi.mock('@/modules/boq/data/boq.repository', () => ({
  findSubcontractorValuationById: (...args: unknown[]) => findSubcontractorValuationById(...args),
  findSubcontractorScheduleById: (...args: unknown[]) => findSubcontractorScheduleById(...args),
  listSubcontractorValuationLines: (...args: unknown[]) => listSubcontractorValuationLines(...args),
  proposeSubcontractorValuationApRpc: (...args: unknown[]) =>
    proposeSubcontractorValuationApRpc(...args),
  findBoqById: vi.fn(),
  findBoqNodeById: vi.fn(),
  findProjectInOrganization: vi.fn(),
  findSubcontractorScheduleLineById: vi.fn(),
  insertSubcontractorSchedule: vi.fn(),
  insertSubcontractorScheduleLine: vi.fn(),
  insertSubcontractorValuation: vi.fn(),
  insertSubcontractorValuationLines: vi.fn(),
  listSubcontractorScheduleLines: vi.fn(),
  listSubcontractorSchedulesForBoq: vi.fn(),
  listSubcontractorValuationsForSchedule: vi.fn(),
  approveSubcontractorValuationRpc: vi.fn(),
  activateSubcontractorScheduleRpc: vi.fn(),
  voidSubcontractorValuationRpc: vi.fn(),
  cumulativeSubValuationApprovedForLine: vi.fn(),
}));

vi.mock('@/modules/vendors', () => ({
  findVendorEngagementById: (...args: unknown[]) => findVendorEngagementById(...args),
}));

vi.mock('@/modules/ap', () => ({
  createDraftApBill: (...args: unknown[]) => createDraftApBill(...args),
}));

vi.mock('@/shared/audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/shared/db', () => ({
  withTransaction: vi.fn(async (db: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(db)),
}));

vi.mock('@/modules/tenancy', () => ({
  noteModuleUsage: vi.fn(async () => undefined),
}));

import { createDraftApFromSubcontractorValuation } from '@/modules/boq/application/manage-subcontractor-schedule';

const VALUATION_ID = '01900000-0000-7000-8000-000000000011';
const SCHEDULE_ID = '01900000-0000-7000-8000-000000000012';
const BILL_ID = '01900000-0000-7000-8000-000000000013';
const VENDOR_ID = '01900000-0000-7000-8000-000000000014';
const PROJECT_ID = '01900000-0000-7000-8000-000000000015';
const ENGAGEMENT_ID = '01900000-0000-7000-8000-000000000016';

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

describe('createDraftApFromSubcontractorValuation', () => {
  beforeEach(() => {
    findSubcontractorValuationById.mockReset();
    findSubcontractorScheduleById.mockReset();
    listSubcontractorValuationLines.mockReset();
    proposeSubcontractorValuationApRpc.mockReset();
    findVendorEngagementById.mockReset();
    createDraftApBill.mockReset();

    findSubcontractorValuationById.mockResolvedValue({
      id: VALUATION_ID,
      scheduleId: SCHEDULE_ID,
      periodLabel: 'March',
      status: 'approved',
      proposedVendorBillId: null,
    });
    findSubcontractorScheduleById.mockResolvedValue({
      id: SCHEDULE_ID,
      projectId: PROJECT_ID,
      vendorEngagementId: ENGAGEMENT_ID,
      currency: 'ILS',
      title: 'Masonry',
    });
    findVendorEngagementById.mockResolvedValue({
      id: ENGAGEMENT_ID,
      vendorId: VENDOR_ID,
      projectId: PROJECT_ID,
    });
    listSubcontractorValuationLines.mockResolvedValue([
      {
        notes: 'Blockwork',
        approvedQuantity: '10.000000',
        unitRateSnapshot: '40.000000',
        periodAmount: '400.000000',
        currency: 'ILS',
      },
    ]);
    createDraftApBill.mockResolvedValue({ id: BILL_ID, status: 'draft' });
    proposeSubcontractorValuationApRpc.mockResolvedValue(undefined);
  });

  it('requires both BOQ_MANAGE and AP_MANAGE', async () => {
    const boqOnly = contextWith([PERMISSIONS.BOQ_MANAGE]);
    await expect(
      createDraftApFromSubcontractorValuation(boqOnly, { valuationId: VALUATION_ID }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const apOnly = contextWith([PERMISSIONS.AP_MANAGE]);
    await expect(
      createDraftApFromSubcontractorValuation(apOnly, { valuationId: VALUATION_ID }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(createDraftApBill).not.toHaveBeenCalled();
  });

  it('creates a draft vendor bill (not Actual, no PO consume) and links the valuation', async () => {
    const manager = contextWith([PERMISSIONS.BOQ_MANAGE, PERMISSIONS.AP_MANAGE]);
    const result = await createDraftApFromSubcontractorValuation(manager, {
      valuationId: VALUATION_ID,
    });

    expect(result.billStatus).toBe('draft');
    expect(isRecognizedVendorBillStatus(result.billStatus)).toBe(false);
    expect(isVendorBillExcludedFromActual(result.billStatus)).toBe(true);
    expect(RECOGNIZED_VENDOR_BILL_STATUSES).not.toContain(result.billStatus);

    expect(createDraftApBill).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', db: manager.db }),
      expect.objectContaining({
        vendorId: VENDOR_ID,
        projectId: PROJECT_ID,
        currency: 'ILS',
        totalAmount: '400.000000',
      }),
    );
    const payload = createDraftApBill.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.purchaseOrderId).toBeUndefined();

    expect(proposeSubcontractorValuationApRpc).toHaveBeenCalledWith(
      manager.db,
      'org-1',
      VALUATION_ID,
      BILL_ID,
    );
    expect(result).toMatchObject({
      valuationId: VALUATION_ID,
      vendorBillId: BILL_ID,
      status: 'proposed_ap',
    });
  });

  it('refuses to create a draft from a non-approved valuation', async () => {
    findSubcontractorValuationById.mockResolvedValue({
      id: VALUATION_ID,
      scheduleId: SCHEDULE_ID,
      periodLabel: 'March',
      status: 'draft',
      proposedVendorBillId: null,
    });
    const manager = contextWith([PERMISSIONS.BOQ_MANAGE, PERMISSIONS.AP_MANAGE]);
    await expect(
      createDraftApFromSubcontractorValuation(manager, { valuationId: VALUATION_ID }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(createDraftApBill).not.toHaveBeenCalled();
  });
});
