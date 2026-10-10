import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { DomainRuleError } from '@/shared/errors';
import {
  connectionCodeExpiry,
  generateConnectionCode,
  hashConnectionCode,
} from '../domain/connection-code';
import {
  insertEngagementConnectionInvitation,
  listInvitationsForAgreement,
  revokeInvitationById,
  revokeOpenInvitationsForAgreement,
} from '../data/connection.repository';
import { assertDeveloperEngagement, requireConnectionCodeIssueAuthority } from './assert-developer-engagement';
import type { EngagementConnectionInvitationRow } from '../domain/types';
import { invitationRuntimeState } from '../domain/connection-lifecycle';

export interface CreateInvitationInput {
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string;
}

export interface CreateInvitationResult {
  readonly invitationId: string;
  /** Plaintext code — show once to the developer. */
  readonly code: string;
  readonly expiresAt: Date;
}

export interface ConnectionInvitationSummary {
  readonly id: string;
  readonly status: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

const err = (key: string) => new DomainRuleError(key, `connectedProjects.errors.${key}`);

export async function createInvitation(
  context: OrgContext,
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  await requireConnectionCodeIssueAuthority(context, input.projectId);
  await assertDeveloperEngagement(context, input);

  const code = generateConnectionCode();
  const codeHash = hashConnectionCode(code);
  const expiresAt = connectionCodeExpiry();

  const invitationId = await asServiceRoleWrite(context.db, async () => {
    await revokeOpenInvitationsForAgreement(
      context.db,
      context.organizationId,
      input.subcontractAgreementId,
    );
    return insertEngagementConnectionInvitation(context.db, {
      developerOrganizationId: context.organizationId,
      developerProjectId: input.projectId,
      subcontractAgreementId: input.subcontractAgreementId,
      vendorId: input.vendorId,
      codeHash,
      expiresAt,
      issuedByUserId: context.userId,
    });
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONNECTED_PROJECT_INVITATION_CREATED,
    entityType: 'engagement_connection_invitation',
    entityId: invitationId,
    after: {
      projectId: input.projectId,
      subcontractAgreementId: input.subcontractAgreementId,
      vendorId: input.vendorId,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return { invitationId, code, expiresAt };
}

export async function listConnectionInvitationsForAgreement(
  context: OrgContext,
  input: { readonly projectId: string; readonly subcontractAgreementId: string },
): Promise<ConnectionInvitationSummary[]> {
  await requireConnectionCodeIssueAuthority(context, input.projectId);
  const rows = await listInvitationsForAgreement(
    context.db,
    context.organizationId,
    input.subcontractAgreementId,
  );
  return rows.map(summarizeInvitation);
}

function summarizeInvitation(row: EngagementConnectionInvitationRow): ConnectionInvitationSummary {
  const runtime = invitationRuntimeState(row);
  const status =
    runtime === 'expired' && row.status === 'issued' ? 'expired' : row.status === 'issued' ? runtime : row.status;
  return {
    id: row.id,
    status,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export async function revokeConnectionInvitation(
  context: OrgContext,
  input: { readonly projectId: string; readonly invitationId: string },
): Promise<void> {
  await requireConnectionCodeIssueAuthority(context, input.projectId);
  const revoked = await asServiceRoleWrite(context.db, () =>
    revokeInvitationById(context.db, context.organizationId, input.invitationId),
  );
  if (!revoked) throw err('invitation_not_revocable');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONNECTED_PROJECT_INVITATION_REVOKED,
    entityType: 'engagement_connection_invitation',
    entityId: input.invitationId,
    after: { projectId: input.projectId },
  });
}

export async function revokeConnectedProjectMapping(
  context: OrgContext,
  input: { readonly projectId: string; readonly mappingId: string },
): Promise<void> {
  await requireConnectionCodeIssueAuthority(context, input.projectId);
  const { revokeMappingById } = await import('../data/connection.repository');
  const revoked = await asServiceRoleWrite(context.db, () =>
    revokeMappingById(context.db, context.organizationId, input.mappingId),
  );
  if (!revoked) throw err('mapping_not_revocable');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONNECTED_PROJECT_MAPPING_REVOKED,
    entityType: 'connected_project_mapping',
    entityId: input.mappingId,
    after: { projectId: input.projectId },
  });
}
