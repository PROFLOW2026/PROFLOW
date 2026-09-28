import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CaptureItemRecord } from '@/modules/quick-capture/domain/types';
import type * as ResolveCaptureReviewNotificationsModule from '@/modules/quick-capture/application/resolve-capture-review-notifications';
import type * as QuickCaptureRepository from '@/modules/quick-capture/data/quick-capture.repository';

const findCaptureById = vi.fn<typeof QuickCaptureRepository.findCaptureById>();
const updateCaptureItem = vi.fn<typeof QuickCaptureRepository.updateCaptureItem>();
const resolveCaptureReviewNotifications = vi.fn<
  typeof ResolveCaptureReviewNotificationsModule.resolveCaptureReviewNotifications
>();

vi.mock('@/modules/quick-capture/data/quick-capture.repository', () => ({
  findCaptureById: (...args: Parameters<typeof findCaptureById>) => findCaptureById(...args),
  updateCaptureItem: (...args: Parameters<typeof updateCaptureItem>) => updateCaptureItem(...args),
}));

vi.mock('@/modules/quick-capture/application/resolve-capture-review-notifications', () => ({
  resolveCaptureReviewNotifications: (...args: Parameters<typeof resolveCaptureReviewNotifications>) =>
    resolveCaptureReviewNotifications(...args),
}));

vi.mock('@/shared/audit', () => ({
  AUDIT_ACTIONS: { REJECTED: 'rejected' },
  recordAuditEvent: vi.fn(async () => undefined),
}));

import { rejectCapture } from '@/modules/quick-capture/application/reject-capture';

const captureId = '01900000-0000-7000-8000-000000000101';

function context(): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test Org',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set([PERMISSIONS.DOCUMENTS_MANAGE]),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function baseCapture(status: CaptureItemRecord['status']): CaptureItemRecord {
  return {
    id: captureId,
    organizationId: 'org-1',
    createdByUserId: 'user-1',
    status,
    source: 'quick_capture',
    sessionKind: 'images',
    documentCount: 1,
    ownerNote: null,
    explicitProjectId: null,
    detectedType: 'financial_document',
    detectionConfidence: 'suggested',
    ownerSelectedType: null,
    suggestedProjectId: null,
    suggestedVendorId: null,
    suggestionMetadata: {},
    primaryOcrJobId: null,
    selectedFinancialDocumentId: null,
    routedEntityType: null,
    routedEntityId: null,
    processingErrorCode: null,
    processingErrorMessage: null,
    idempotencyKey: null,
    capturedAt: '2026-09-27T00:00:00.000Z',
    processedAt: '2026-09-27T00:00:01.000Z',
    reviewedAt: '2026-09-27T00:00:02.000Z',
    approvedAt: null,
    rejectedAt: null,
    archivedAt: null,
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:02.000Z',
  };
}

describe('rejectCapture notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCaptureReviewNotifications.mockResolvedValue(1);
    findCaptureById.mockResolvedValue(baseCapture('ready_for_review'));
  });

  it('resolves capture_needs_review after reject', async () => {
    updateCaptureItem.mockResolvedValue(baseCapture('rejected'));

    await rejectCapture(context(), { captureId, mode: 'reject' });

    expect(resolveCaptureReviewNotifications).toHaveBeenCalledWith(expect.anything(), captureId);
  });

  it('resolves capture_needs_review after archive', async () => {
    updateCaptureItem.mockResolvedValue(baseCapture('archived'));

    await rejectCapture(context(), { captureId, mode: 'archive' });

    expect(resolveCaptureReviewNotifications).toHaveBeenCalledWith(expect.anything(), captureId);
  });
});
