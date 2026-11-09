import { createDefect } from '@/modules/defects/application/manage-defects';
import { linkEvidenceDocumentToEntity } from '@/modules/evidence/application/link-evidence-entity';
import { assertProjectCapability, PROJECT_CAPABILITIES } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { findCaptureJoin } from '../data/infra.repository';

export async function createDefectFromInfraCapture(
  context: OrgContext,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly captureId: string;
    readonly title: string;
    readonly description?: string | null;
  },
): Promise<{ readonly defectId: string; readonly href: string }> {
  if (input.organizationId !== context.organizationId) {
    throw new NotFoundError('Capture');
  }
  await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.DEFECTS_MANAGE);

  const capture = await findCaptureJoin(context.db, input.organizationId, input.captureId);
  if (!capture || capture.projectId !== input.projectId) {
    throw new NotFoundError('Capture');
  }
  if (capture.evidenceStatus !== 'available') {
    throw new DomainRuleError('Capture is not available', 'infraMapping.errors.captureNotReady');
  }

  const { defectId } = await createDefect(context, {
    projectId: input.projectId,
    title: input.title.trim(),
    description: input.description?.trim() || capture.description || capture.note || null,
    severity: 'medium',
    locationId: capture.locationId,
    mode: 'construction',
    contractorVisible: true,
  });

  await linkEvidenceDocumentToEntity(context.db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceEvidenceId: capture.evidenceId,
    entityType: 'defect',
    entityId: defectId,
    uploadedByUserId: context.userId,
  });

  return { defectId, href: `/projects/${input.projectId}/defects/${defectId}` };
}
