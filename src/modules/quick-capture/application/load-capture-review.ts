import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findDocumentById } from '@/modules/documents/lookups';
import type { ExtractionJob } from '@/modules/ocr';
import { getOcrProviderStatus } from '@/modules/ocr/application/provider-status';
import { getOcrRepository } from '@/modules/ocr';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { getOrganizationTaxId } from '@/modules/tenancy';
import type { CaptureDocumentDetail, CaptureItemRecord } from '../domain/types';
import { listCaptureDocumentsByCaptureId } from '../data/capture-documents.repository';
import { findCaptureById } from '../data/quick-capture.repository';

export type CaptureReviewData = {
  readonly capture: CaptureItemRecord;
  readonly documents: readonly CaptureDocumentDetail[];
  readonly ocrJob: ExtractionJob | null;
  readonly projects: readonly { id: string; name: string }[];
  readonly vendors: readonly { id: string; name: string }[];
  readonly organizationId: string;
  readonly organizationTaxId: string | null;
  readonly canManageDocuments: boolean;
  readonly canCreateExpenses: boolean;
  readonly canManageAp: boolean;
  readonly ocrLive: boolean;
};

export async function loadCaptureReview(
  context: OrgContext,
  captureId: string,
): Promise<CaptureReviewData> {
  const capture = await findCaptureById(context.db, context.organizationId, captureId);
  if (!capture) throw new NotFoundError('Quick capture');

  const junctionDocs = await listCaptureDocumentsByCaptureId(
    context.db,
    context.organizationId,
    captureId,
  );

  const documents: CaptureDocumentDetail[] = [];
  for (const junction of junctionDocs) {
    const document = await findDocumentById(
      context.db,
      context.organizationId,
      junction.documentId,
    );
    if (!document) continue;
    documents.push({
      documentId: document.id,
      position: junction.position,
      fileName: document.originalFilename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes ?? 0,
    });
  }

  const ocrJob = capture.primaryOcrJobId
    ? await getOcrRepository(context.db).findJob(context.organizationId, capture.primaryOcrJobId)
    : null;

  const [projects, vendors, organizationTaxId, ocrStatus] = await Promise.all([
    listProjectsForOrg(context, { status: 'active' }).catch(() => []),
    listVendorsForOrg(context, { status: 'active' })
      .then((rows) => rows.map((vendor) => ({ id: vendor.id, name: vendor.name })))
      .catch(() => []),
    getOrganizationTaxId(context.db, context.organizationId),
    Promise.resolve(getOcrProviderStatus(context)),
  ]);

  return {
    capture,
    documents,
    ocrJob,
    projects: projects.map((project) => ({ id: project.id, name: project.name })),
    vendors,
    organizationId: context.organizationId,
    organizationTaxId,
    canManageDocuments: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
    canCreateExpenses: hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
    canManageAp: hasPermission(context, PERMISSIONS.AP_MANAGE),
    ocrLive: ocrStatus.ingestionEnabled && ocrStatus.featureMode === 'live',
  };
}
