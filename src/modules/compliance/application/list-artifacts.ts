import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { todayInTimeZone } from '@/shared/dates/dates';
import { resolveArtifactStatus } from '../domain/status';
import type {
  ComplianceArtifactRecord,
  ComplianceListFilters,
  ComplianceListItem,
} from '../domain/types';
import {
  findComplianceArtifactById,
  listComplianceArtifacts,
} from '../data/compliance.repository';
import { listComplianceArtifactsSchema } from '../validation/schemas';

function withResolvedStatus(
  artifact: ComplianceArtifactRecord,
  today: ReturnType<typeof todayInTimeZone>,
): ComplianceListItem {
  return {
    ...artifact,
    status: resolveArtifactStatus({
      expiresOn: artifact.expiresOn,
      storedStatus: artifact.status,
      today,
    }),
  };
}

export async function listComplianceArtifactsForOrg(
  context: OrgContext,
  rawFilters: ComplianceListFilters = {},
): Promise<ComplianceListItem[]> {
  assertPermission(context, PERMISSIONS.COMPLIANCE_READ);

  const parsed = listComplianceArtifactsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const { status: statusFilter, ...dbFilters } = parsed.data;
  const rows = await listComplianceArtifacts(context.db, context.organizationId, dbFilters);
  const today = todayInTimeZone(context.organization.timezone);

  const resolved = rows.map((row) => withResolvedStatus(row, today));

  if (statusFilter && statusFilter !== 'all') {
    return resolved.filter((row) => row.status === statusFilter);
  }

  return resolved;
}

export async function getComplianceArtifactById(
  context: OrgContext,
  artifactId: string,
): Promise<ComplianceListItem> {
  assertPermission(context, PERMISSIONS.COMPLIANCE_READ);

  const artifact = await findComplianceArtifactById(
    context.db,
    context.organizationId,
    artifactId,
  );
  if (!artifact) throw new NotFoundError('Compliance artifact');

  const today = todayInTimeZone(context.organization.timezone);
  return withResolvedStatus(artifact, today);
}
