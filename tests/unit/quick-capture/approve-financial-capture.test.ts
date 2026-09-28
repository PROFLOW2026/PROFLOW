import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CaptureItemRecord } from '@/modules/quick-capture/domain/types';
import type { ExtractionJob } from '@/modules/ocr/domain/types';
import type * as AssertCaptureSessionDocumentModule from '@/modules/quick-capture/application/assert-capture-session-document';
import type * as ResolveCaptureReviewNotificationsModule from '@/modules/quick-capture/application/resolve-capture-review-notifications';
import type * as CaptureDocumentsRepository from '@/modules/quick-capture/data/capture-documents.repository';
import type * as QuickCaptureRepository from '@/modules/quick-capture/data/quick-capture.repository';
import type * as RelocateDocumentModule from '@/modules/external-storage/application/relocate-document-file';
import type * as ConfirmOcrCandidateModule from '@/modules/ocr/application/confirm-candidate';

const findCaptureById = vi.fn<typeof QuickCaptureRepository.findCaptureById>();
const updateCaptureItem = vi.fn<typeof QuickCaptureRepository.updateCaptureItem>();
const listCaptureDocumentsByCaptureId = vi.fn<
  typeof CaptureDocumentsRepository.listCaptureDocumentsByCaptureId
>();
const assertCaptureSessionDocument = vi.fn<
  typeof AssertCaptureSessionDocumentModule.assertCaptureSessionDocument
>();
const confirmOcrCandidate = vi.fn<typeof ConfirmOcrCandidateModule.confirmOcrCandidate>();
const relocateDocumentToSemanticFolder = vi.fn<
  typeof RelocateDocumentModule.relocateDocumentToSemanticFolder
>();
const findJob = vi.fn<(organizationId: string, jobId: string) => Promise<ExtractionJob | null>>();

vi.mock('@/modules/quick-capture/data/quick-capture.repository', () => ({
  findCaptureById: (...args: Parameters<typeof findCaptureById>) => findCaptureById(...args),
  updateCaptureItem: (...args: Parameters<typeof updateCaptureItem>) => updateCaptureItem(...args),
}));

vi.mock('@/modules/quick-capture/data/capture-documents.repository', () => ({
  listCaptureDocumentsByCaptureId: (...args: Parameters<typeof listCaptureDocumentsByCaptureId>) =>
    listCaptureDocumentsByCaptureId(...args),
}));

vi.mock('@/modules/quick-capture/application/assert-capture-session-document', () => ({
  assertCaptureSessionDocument: (...args: Parameters<typeof assertCaptureSessionDocument>) =>
    assertCaptureSessionDocument(...args),
}));

vi.mock('@/modules/ocr/application/confirm-candidate', () => ({
  confirmOcrCandidate: (...args: Parameters<typeof confirmOcrCandidate>) => confirmOcrCandidate(...args),
}));

vi.mock('@/modules/ocr', () => ({
  getOcrRepository: () => ({ findJob }),
}));

vi.mock('@/modules/external-storage/application/relocate-document-file', () => ({
  relocateDocumentToSemanticFolder: (...args: Parameters<typeof relocateDocumentToSemanticFolder>) =>
    relocateDocumentToSemanticFolder(...args),
}));

vi.mock('@/shared/audit', () => ({
  AUDIT_ACTIONS: { APPROVED: 'approved' },
  recordAuditEvent: vi.fn(async () => undefined),
}));

const resolveCaptureReviewNotifications = vi.fn<
  typeof ResolveCaptureReviewNotificationsModule.resolveCaptureReviewNotifications
>();

vi.mock('@/modules/quick-capture/application/resolve-capture-review-notifications', () => ({
  resolveCaptureReviewNotifications: (...args: Parameters<typeof resolveCaptureReviewNotifications>) =>
    resolveCaptureReviewNotifications(...args),
}));

import { approveFinancialCapture } from '@/modules/quick-capture/application/approve-capture';

const captureId = '01900000-0000-7000-8000-000000000101';
const jobId = '01900000-0000-7000-8000-000000000201';
const documentId = '01900000-0000-7000-8000-000000000301';
const expenseId = '01900000-0000-7000-8000-000000000401';
const projectId = '01900000-0000-7000-8000-000000000501';
const costCategoryId = '01900000-0000-7000-8000-000000000601';

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
    permissions: new Set([PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.EXPENSES_CREATE]),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function baseCapture(overrides: Partial<CaptureItemRecord> = {}): CaptureItemRecord {
  return {
    id: captureId,
    organizationId: 'org-1',
    createdByUserId: 'user-1',
    status: 'ready_for_review',
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
    primaryOcrJobId: jobId,
    selectedFinancialDocumentId: documentId,
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
    ...overrides,
  };
}

function baseJob(overrides: Partial<ExtractionJob> = {}): ExtractionJob {
  return {
    id: jobId,
    organizationId: 'org-1',
    documentId,
    sourceDocument: { documentId, versionId: null },
    status: 'needs_review',
    reviewStatus: 'awaiting_review',
    candidates: null,
    extractedCandidates: null,
    reviewOverrides: null,
    acceptedFields: null,
    rejectedFields: null,
    rawMetadata: null,
    overallConfidence: null,
    errorCode: null,
    errorMessage: null,
    providerId: 'azure',
    confirmedExpenseId: null,
    confirmedVendorBillId: null,
    confirmedVendorCreditId: null,
    confirmedDraftTarget: null,
    documentVersionId: null,
    batchId: null,
    attemptCount: 1,
    lastError: null,
    idempotencyKey: null,
    queuedAt: '2026-09-27T00:00:00.000Z',
    claimedAt: null,
    startedAt: null,
    completedAt: '2026-09-27T00:00:01.000Z',
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:01.000Z',
    ...overrides,
  } as ExtractionJob;
}

describe('approveFinancialCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCaptureReviewNotifications.mockResolvedValue(1);
    findCaptureById.mockResolvedValue(baseCapture());
    listCaptureDocumentsByCaptureId.mockResolvedValue([
      {
        id: '01900000-0000-7000-8000-000000000501',
        quickCaptureItemId: captureId,
        organizationId: 'org-1',
        documentId,
        position: 0,
        ocrJobId: jobId,
        createdAt: '2026-09-27T00:00:00.000Z',
      },
    ]);
    assertCaptureSessionDocument.mockResolvedValue(undefined);
    findJob.mockResolvedValue(baseJob());
  });

  it('reconciles to an existing OCR-confirmed expense without calling confirm again', async () => {
    findJob.mockResolvedValue(
      baseJob({
        status: 'succeeded',
        reviewStatus: 'accepted',
        confirmedExpenseId: expenseId,
        confirmedDraftTarget: 'expense',
      }),
    );
    updateCaptureItem.mockResolvedValue(
      baseCapture({
        status: 'approved',
        ownerSelectedType: 'financial_document',
        routedEntityType: 'expense',
        routedEntityId: expenseId,
        approvedAt: '2026-09-27T00:00:03.000Z',
      }),
    );

    await approveFinancialCapture(context(), {
      captureId,
      expenseAssignment: { mode: 'company' },
      confirmInput: { jobId, confirm: true, draftTarget: 'expense', acceptedFields: [] },
    });

    expect(confirmOcrCandidate).not.toHaveBeenCalled();
    expect(relocateDocumentToSemanticFolder).not.toHaveBeenCalled();
    expect(updateCaptureItem).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      captureId,
      expect.objectContaining({
        status: 'approved',
        routedEntityType: 'expense',
        routedEntityId: expenseId,
      }),
    );
    expect(resolveCaptureReviewNotifications).toHaveBeenCalledWith(expect.anything(), captureId);
  });

  it('routes new confirms to the created expense draft id', async () => {
    confirmOcrCandidate.mockResolvedValue({
      kind: 'created',
      draftTarget: 'expense',
      expenseId,
      job: baseJob({
        status: 'succeeded',
        reviewStatus: 'accepted',
        confirmedExpenseId: expenseId,
        confirmedDraftTarget: 'expense',
      }),
      expenseInput: {} as never,
      expenseDraft: {} as never,
      draft: {} as never,
    });
    updateCaptureItem.mockResolvedValue(
      baseCapture({
        status: 'approved',
        routedEntityType: 'expense',
        routedEntityId: expenseId,
      }),
    );

    await approveFinancialCapture(context(), {
      captureId,
      expenseAssignment: { mode: 'company' },
      confirmInput: { jobId, confirm: true, draftTarget: 'expense', acceptedFields: [] },
    });

    expect(confirmOcrCandidate).toHaveBeenCalledOnce();
    expect(relocateDocumentToSemanticFolder).not.toHaveBeenCalled();
    expect(updateCaptureItem).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      captureId,
      expect.objectContaining({
        routedEntityType: 'expense',
        routedEntityId: expenseId,
      }),
    );
  });

  it('passes owner project routing without category and relocates vendor invoice folder', async () => {
    confirmOcrCandidate.mockResolvedValue({
      kind: 'created',
      draftTarget: 'expense',
      expenseId,
      job: baseJob({
        status: 'succeeded',
        reviewStatus: 'accepted',
        confirmedExpenseId: expenseId,
        confirmedDraftTarget: 'expense',
      }),
      expenseInput: {} as never,
      expenseDraft: {} as never,
      draft: {} as never,
    });
    updateCaptureItem.mockResolvedValue(
      baseCapture({
        status: 'approved',
        routedEntityType: 'expense',
        routedEntityId: expenseId,
      }),
    );
    relocateDocumentToSemanticFolder.mockResolvedValue({} as never);

    await approveFinancialCapture(context(), {
      captureId,
      expenseAssignment: { mode: 'project', projectId },
      confirmInput: { jobId, confirm: true, draftTarget: 'expense', acceptedFields: [] },
    });

    expect(confirmOcrCandidate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerProjectId: projectId,
        ownerCostCategoryId: null,
      }),
    );
    expect(relocateDocumentToSemanticFolder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId,
        projectId,
        semanticFolderType: 'vendor_invoices',
      }),
    );
  });

  it('passes optional owner cost category when provided', async () => {
    confirmOcrCandidate.mockResolvedValue({
      kind: 'created',
      draftTarget: 'expense',
      expenseId,
      job: baseJob({
        status: 'succeeded',
        reviewStatus: 'accepted',
        confirmedExpenseId: expenseId,
        confirmedDraftTarget: 'expense',
      }),
      expenseInput: {} as never,
      expenseDraft: {} as never,
      draft: {} as never,
    });
    updateCaptureItem.mockResolvedValue(
      baseCapture({
        status: 'approved',
        routedEntityType: 'expense',
        routedEntityId: expenseId,
      }),
    );
    relocateDocumentToSemanticFolder.mockResolvedValue({} as never);

    await approveFinancialCapture(context(), {
      captureId,
      expenseAssignment: { mode: 'project', projectId, costCategoryId },
      confirmInput: { jobId, confirm: true, draftTarget: 'expense', acceptedFields: [] },
    });

    expect(confirmOcrCandidate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerProjectId: projectId,
        ownerCostCategoryId: costCategoryId,
      }),
    );
    expect(relocateDocumentToSemanticFolder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId,
        projectId,
        semanticFolderType: 'vendor_invoices',
      }),
    );
  });
});
