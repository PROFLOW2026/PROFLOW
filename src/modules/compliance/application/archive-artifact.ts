import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ComplianceArtifactRecord } from '../domain/types';
import {
  findComplianceArtifactById,
  updateComplianceArtifactById,
} from '../data/compliance.repository';
import { archiveComplianceArtifactSchema } from '../validation/schemas';

export async function archiveComplianceArtifact(
  context: OrgContext,
  rawInput: { artifactId: string },
): Promise<ComplianceArtifactRecord> {
  assertPermission(context, PERMISSIONS.COMPLIANCE_MANAGE);

  const parsed = archiveComplianceArtifactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findComplianceArtifactById(
    context.db,
    context.organizationId,
    parsed.data.artifactId,
  );
  if (!existing) throw new NotFoundError('Compliance artifact');
  assertSameOrganization(context, existing, 'Compliance artifact');

  const updated = await updateComplianceArtifactById(
    context.db,
    context.organizationId,
    parsed.data.artifactId,
    { archivedAt: new Date() },
  );

  if (!updated) throw new NotFoundError('Compliance artifact');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COMPLIANCE_ARTIFACT_UPDATED,
    entityType: 'compliance_artifact',
    entityId: updated.id,
    before: existing,
    after: updated,
    metadata: { archived: true },
  });

  return updated;
}
