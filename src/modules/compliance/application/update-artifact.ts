import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates/dates';
import { deriveArtifactStatus } from '../domain/status';
import type { ComplianceArtifactRecord, ManualArtifactStatus } from '../domain/types';
import {
  findComplianceArtifactById,
  updateComplianceArtifactById,
} from '../data/compliance.repository';
import {
  updateComplianceArtifactSchema,
  type UpdateComplianceArtifactInput,
} from '../validation/schemas';

function manualFromMode(
  mode: 'auto' | ManualArtifactStatus | undefined,
  previous: ComplianceArtifactRecord['status'],
): ManualArtifactStatus | null {
  if (mode === 'pending' || mode === 'revoked') return mode;
  if (mode === 'auto') return null;
  if (previous === 'pending' || previous === 'revoked') return previous;
  return null;
}

export async function updateComplianceArtifact(
  context: OrgContext,
  rawInput: UpdateComplianceArtifactInput,
): Promise<ComplianceArtifactRecord> {
  assertPermission(context, PERMISSIONS.COMPLIANCE_MANAGE);

  const parsed = updateComplianceArtifactSchema.safeParse(rawInput);
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

  const expiresOn =
    parsed.data.expiresOn !== undefined ? parsed.data.expiresOn : existing.expiresOn;
  const today = todayInTimeZone(context.organization.timezone);
  const status = deriveArtifactStatus({
    expiresOn,
    manualStatus: manualFromMode(parsed.data.statusMode, existing.status),
    today,
  });

  const updated = await updateComplianceArtifactById(
    context.db,
    context.organizationId,
    parsed.data.artifactId,
    {
      artifactKind: parsed.data.artifactKind,
      name: parsed.data.name,
      referenceNumber: parsed.data.referenceNumber,
      issuer: parsed.data.issuer,
      issuedOn: parsed.data.issuedOn,
      expiresOn: parsed.data.expiresOn,
      status,
      subjectType: parsed.data.subjectType,
      subjectId: parsed.data.subjectId,
      documentId: parsed.data.documentId,
      notes: parsed.data.notes,
    },
  );

  if (!updated) throw new NotFoundError('Compliance artifact');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COMPLIANCE_ARTIFACT_UPDATED,
    entityType: 'compliance_artifact',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
