import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates/dates';
import { noteModuleUsage } from '@/modules/tenancy';
import { deriveArtifactStatus } from '../domain/status';
import type { ComplianceArtifactRecord, ManualArtifactStatus } from '../domain/types';
import { insertComplianceArtifact } from '../data/compliance.repository';
import {
  createComplianceArtifactSchema,
  type CreateComplianceArtifactInput,
} from '../validation/schemas';

function manualFromMode(
  mode: 'auto' | ManualArtifactStatus | undefined,
): ManualArtifactStatus | null {
  if (mode === 'pending' || mode === 'revoked') return mode;
  return null;
}

export async function createComplianceArtifact(
  context: OrgContext,
  rawInput: CreateComplianceArtifactInput,
): Promise<ComplianceArtifactRecord> {
  assertPermission(context, PERMISSIONS.COMPLIANCE_MANAGE);

  const parsed = createComplianceArtifactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const today = todayInTimeZone(context.organization.timezone);
  const status = deriveArtifactStatus({
    expiresOn: input.expiresOn ?? null,
    manualStatus: manualFromMode(input.statusMode),
    today,
  });

  const artifact = await insertComplianceArtifact(context.db, {
    organizationId: context.organizationId,
    artifactKind: input.artifactKind,
    name: input.name,
    referenceNumber: input.referenceNumber ?? null,
    issuer: input.issuer ?? null,
    issuedOn: input.issuedOn ?? null,
    expiresOn: input.expiresOn ?? null,
    status,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'compliance');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COMPLIANCE_ARTIFACT_CREATED,
    entityType: 'compliance_artifact',
    entityId: artifact.id,
    after: artifact,
  });

  return artifact;
}
