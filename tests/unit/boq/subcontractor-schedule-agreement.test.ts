import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

const findProjectInOrganization = vi.fn();
const findBoqById = vi.fn();
const insertSubcontractorSchedule = vi.fn();
const findSubcontractorScheduleById = vi.fn();
const findVendorEngagementById = vi.fn();
const findSubcontractAgreementById = vi.fn();
const findActiveEngagementForVendorProject = vi.fn();

vi.mock('@/modules/boq/data/boq.repository', () => ({
  findProjectInOrganization: (...args: unknown[]) => findProjectInOrganization(...args),
  findBoqById: (...args: unknown[]) => findBoqById(...args),
  insertSubcontractorSchedule: (...args: unknown[]) => insertSubcontractorSchedule(...args),
  findSubcontractorScheduleById: (...args: unknown[]) => findSubcontractorScheduleById(...args),
  findBoqNodeById: vi.fn(),
  findSubcontractorScheduleLineById: vi.fn(),
  insertSubcontractorScheduleLine: vi.fn(),
  insertSubcontractorValuation: vi.fn(),
  insertSubcontractorValuationLines: vi.fn(),
  listSubcontractorScheduleLines: vi.fn(),
  listSubcontractorSchedulesForBoq: vi.fn(),
  listSubcontractorValuationsForSchedule: vi.fn(),
  listSubcontractorValuationLines: vi.fn(),
  findSubcontractorValuationById: vi.fn(),
  approveSubcontractorValuationRpc: vi.fn(),
  activateSubcontractorScheduleRpc: vi.fn(),
  proposeSubcontractorValuationApRpc: vi.fn(),
  voidSubcontractorValuationRpc: vi.fn(),
  cumulativeSubValuationApprovedForLine: vi.fn(),
}));

vi.mock('@/modules/vendors', () => ({
  findVendorEngagementById: (...args: unknown[]) => findVendorEngagementById(...args),
  findSubcontractAgreementById: (...args: unknown[]) => findSubcontractAgreementById(...args),
  findActiveEngagementForVendorProject: (...args: unknown[]) =>
    findActiveEngagementForVendorProject(...args),
}));

vi.mock('@/shared/audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/modules/tenancy', () => ({
  noteModuleUsage: vi.fn(async () => undefined),
}));

import { createSubcontractorSchedule } from '@/modules/boq/application/manage-subcontractor-schedule';

const PROJECT_ID = '01900000-0000-7000-8000-000000000021';
const BOQ_ID = '01900000-0000-7000-8000-000000000022';
const ENGAGEMENT_A = '01900000-0000-7000-8000-000000000023';
const ENGAGEMENT_B = '01900000-0000-7000-8000-000000000024';
const VENDOR_A = '01900000-0000-7000-8000-000000000025';
const VENDOR_B = '01900000-0000-7000-8000-000000000026';
const AGREEMENT_ID = '01900000-0000-7000-8000-000000000027';
const SCHEDULE_ID = '01900000-0000-7000-8000-000000000028';

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

describe('createSubcontractorSchedule agreement link', () => {
  beforeEach(() => {
    findProjectInOrganization.mockReset();
    findBoqById.mockReset();
    insertSubcontractorSchedule.mockReset();
    findSubcontractorScheduleById.mockReset();
    findVendorEngagementById.mockReset();
    findSubcontractAgreementById.mockReset();
    findActiveEngagementForVendorProject.mockReset();

    findProjectInOrganization.mockResolvedValue({ id: PROJECT_ID });
    findBoqById.mockResolvedValue({ id: BOQ_ID, projectId: PROJECT_ID, currency: 'ILS' });
    findVendorEngagementById.mockResolvedValue({
      id: ENGAGEMENT_A,
      vendorId: VENDOR_A,
      projectId: PROJECT_ID,
    });
    insertSubcontractorSchedule.mockResolvedValue(SCHEDULE_ID);
    findSubcontractorScheduleById.mockResolvedValue({
      id: SCHEDULE_ID,
      subcontractAgreementId: AGREEMENT_ID,
      vendorEngagementId: ENGAGEMENT_B,
    });
  });

  it('persists subcontractAgreementId and prefers the agreement vendor engagement', async () => {
    findSubcontractAgreementById.mockResolvedValue({
      id: AGREEMENT_ID,
      vendorId: VENDOR_B,
      projectId: PROJECT_ID,
    });
    findActiveEngagementForVendorProject.mockResolvedValue({
      id: ENGAGEMENT_B,
      vendorId: VENDOR_B,
      projectId: PROJECT_ID,
    });

    const manager = contextWith([PERMISSIONS.BOQ_MANAGE]);
    await createSubcontractorSchedule(manager, {
      projectId: PROJECT_ID,
      boqId: BOQ_ID,
      vendorEngagementId: ENGAGEMENT_A,
      subcontractAgreementId: AGREEMENT_ID,
      title: 'Masonry package',
    });

    expect(insertSubcontractorSchedule).toHaveBeenCalledWith(
      manager.db,
      'org-1',
      expect.objectContaining({
        vendorEngagementId: ENGAGEMENT_B,
        subcontractAgreementId: AGREEMENT_ID,
        projectId: PROJECT_ID,
        boqId: BOQ_ID,
      }),
    );
  });
});
