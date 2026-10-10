import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { connectedProjectMappings, engagementConnectionInvitations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ConnectedProjectMappingRow, EngagementConnectionInvitationRow } from '../domain/types';
import type { MappingStatus, ProvisioningStatus } from '../domain/connection-lifecycle';

export type EngagementConnectionInvitationInsert = {
  readonly developerOrganizationId: string;
  readonly developerProjectId: string;
  readonly subcontractAgreementId: string;
  readonly vendorId: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly issuedByUserId: string | null;
};

function mapInvitation(row: typeof engagementConnectionInvitations.$inferSelect): EngagementConnectionInvitationRow {
  return row as EngagementConnectionInvitationRow;
}

function mapMapping(row: typeof connectedProjectMappings.$inferSelect): ConnectedProjectMappingRow {
  return row as ConnectedProjectMappingRow;
}

export async function insertEngagementConnectionInvitation(
  db: DbExecutor,
  values: EngagementConnectionInvitationInsert,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(engagementConnectionInvitations).values({
    id,
    ...values,
    status: 'issued',
  });
  return id;
}

/** @deprecated use insertEngagementConnectionInvitation */
export const insertConnectedProjectInvitation = insertEngagementConnectionInvitation;

export async function revokeOpenInvitationsForAgreement(
  db: DbExecutor,
  developerOrganizationId: string,
  subcontractAgreementId: string,
  revokedAt: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(engagementConnectionInvitations)
    .set({ status: 'revoked', revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(engagementConnectionInvitations.developerOrganizationId, developerOrganizationId),
        eq(engagementConnectionInvitations.subcontractAgreementId, subcontractAgreementId),
        eq(engagementConnectionInvitations.status, 'issued'),
        isNull(engagementConnectionInvitations.consumedAt),
        isNull(engagementConnectionInvitations.revokedAt),
      ),
    )
    .returning({ id: engagementConnectionInvitations.id });
  return rows.length;
}

export async function findInvitationByCodeHash(
  db: DbExecutor,
  codeHash: string,
): Promise<EngagementConnectionInvitationRow | null> {
  const [row] = await db
    .select()
    .from(engagementConnectionInvitations)
    .where(eq(engagementConnectionInvitations.codeHash, codeHash))
    .limit(1);
  return row ? mapInvitation(row) : null;
}

/** @deprecated use findInvitationByCodeHash */
export const findInvitationByTokenHash = findInvitationByCodeHash;

export async function findInvitationById(
  db: DbExecutor,
  developerOrganizationId: string,
  invitationId: string,
): Promise<EngagementConnectionInvitationRow | null> {
  const [row] = await db
    .select()
    .from(engagementConnectionInvitations)
    .where(
      and(
        eq(engagementConnectionInvitations.id, invitationId),
        eq(engagementConnectionInvitations.developerOrganizationId, developerOrganizationId),
      ),
    )
    .limit(1);
  return row ? mapInvitation(row) : null;
}

export async function markInvitationConsumed(
  db: DbExecutor,
  invitationId: string,
  input: { readonly consumedByOrganizationId: string; readonly consumedByUserId: string | null },
  consumedAt: Date = new Date(),
): Promise<void> {
  await db
    .update(engagementConnectionInvitations)
    .set({
      status: 'consumed',
      consumedAt,
      consumedByOrganizationId: input.consumedByOrganizationId,
      consumedByUserId: input.consumedByUserId,
      updatedAt: consumedAt,
    })
    .where(
      and(
        eq(engagementConnectionInvitations.id, invitationId),
        eq(engagementConnectionInvitations.status, 'issued'),
        isNull(engagementConnectionInvitations.consumedAt),
      ),
    );
}

export async function revokeInvitationById(
  db: DbExecutor,
  developerOrganizationId: string,
  invitationId: string,
  revokedAt: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(engagementConnectionInvitations)
    .set({ status: 'revoked', revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(engagementConnectionInvitations.id, invitationId),
        eq(engagementConnectionInvitations.developerOrganizationId, developerOrganizationId),
        eq(engagementConnectionInvitations.status, 'issued'),
        isNull(engagementConnectionInvitations.consumedAt),
      ),
    )
    .returning({ id: engagementConnectionInvitations.id });
  return rows.length > 0;
}

export async function listInvitationsForAgreement(
  db: DbExecutor,
  developerOrganizationId: string,
  subcontractAgreementId: string,
  limit = 20,
): Promise<EngagementConnectionInvitationRow[]> {
  const rows = await db
    .select()
    .from(engagementConnectionInvitations)
    .where(
      and(
        eq(engagementConnectionInvitations.developerOrganizationId, developerOrganizationId),
        eq(engagementConnectionInvitations.subcontractAgreementId, subcontractAgreementId),
      ),
    )
    .orderBy(desc(engagementConnectionInvitations.createdAt))
    .limit(limit);
  return rows.map(mapInvitation);
}

export async function findMappingByInvitationAndContractorOrg(
  db: DbExecutor,
  invitationId: string,
  contractorOrganizationId: string,
): Promise<ConnectedProjectMappingRow | null> {
  const [row] = await db
    .select()
    .from(connectedProjectMappings)
    .where(
      and(
        eq(connectedProjectMappings.invitationId, invitationId),
        eq(connectedProjectMappings.contractorOrganizationId, contractorOrganizationId),
      ),
    )
    .limit(1);
  return row ? mapMapping(row) : null;
}

export async function findActiveMappingByAgreementAndContractorOrg(
  db: DbExecutor,
  subcontractAgreementId: string,
  contractorOrganizationId: string,
): Promise<ConnectedProjectMappingRow | null> {
  const [row] = await db
    .select()
    .from(connectedProjectMappings)
    .where(
      and(
        eq(connectedProjectMappings.subcontractAgreementId, subcontractAgreementId),
        eq(connectedProjectMappings.contractorOrganizationId, contractorOrganizationId),
        inArray(connectedProjectMappings.status, ['pending', 'provisioning', 'active']),
        isNull(connectedProjectMappings.revokedAt),
      ),
    )
    .limit(1);
  return row ? mapMapping(row) : null;
}

export async function insertConnectedProjectMapping(
  db: DbExecutor,
  values: {
    readonly invitationId: string;
    readonly developerOrganizationId: string;
    readonly developerProjectId: string;
    readonly subcontractAgreementId: string;
    readonly contractorOrganizationId: string;
    readonly contractorProjectId?: string | null;
    readonly contractorClientId?: string | null;
    readonly acceptedByUserId: string | null;
    readonly acceptedAt: Date;
    readonly provisioningStatus?: ProvisioningStatus;
    readonly status?: MappingStatus;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(connectedProjectMappings).values({
    id,
    invitationId: values.invitationId,
    developerOrganizationId: values.developerOrganizationId,
    developerProjectId: values.developerProjectId,
    subcontractAgreementId: values.subcontractAgreementId,
    contractorOrganizationId: values.contractorOrganizationId,
    contractorProjectId: values.contractorProjectId ?? null,
    contractorClientId: values.contractorClientId ?? null,
    acceptedByUserId: values.acceptedByUserId,
    acceptedAt: values.acceptedAt,
    status: values.status ?? 'provisioning',
    provisioningStatus: values.provisioningStatus ?? 'in_progress',
    connectionVersion: 1,
  });
  return id;
}

export async function updateMappingProvisioning(
  db: DbExecutor,
  mappingId: string,
  contractorOrganizationId: string,
  patch: {
    readonly provisioningStatus: ProvisioningStatus;
    readonly status?: MappingStatus;
    readonly contractorClientId?: string | null;
    readonly contractorProjectId?: string;
  },
): Promise<void> {
  await db
    .update(connectedProjectMappings)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(connectedProjectMappings.id, mappingId),
        eq(connectedProjectMappings.contractorOrganizationId, contractorOrganizationId),
      ),
    );
}

export async function findMappingByIdForContractorOrg(
  db: DbExecutor,
  mappingId: string,
  contractorOrganizationId: string,
): Promise<ConnectedProjectMappingRow | null> {
  const [row] = await db
    .select()
    .from(connectedProjectMappings)
    .where(
      and(
        eq(connectedProjectMappings.id, mappingId),
        eq(connectedProjectMappings.contractorOrganizationId, contractorOrganizationId),
      ),
    )
    .limit(1);
  return row ? mapMapping(row) : null;
}

export async function listFailedProvisioningMappingsForContractorOrg(
  db: DbExecutor,
  contractorOrganizationId: string,
  limit = 10,
): Promise<ConnectedProjectMappingRow[]> {
  const rows = await db
    .select()
    .from(connectedProjectMappings)
    .where(
      and(
        eq(connectedProjectMappings.contractorOrganizationId, contractorOrganizationId),
        eq(connectedProjectMappings.provisioningStatus, 'failed'),
        isNull(connectedProjectMappings.revokedAt),
      ),
    )
    .orderBy(desc(connectedProjectMappings.updatedAt))
    .limit(limit);
  return rows.map(mapMapping);
}

export async function revokeMappingById(
  db: DbExecutor,
  developerOrganizationId: string,
  mappingId: string,
  revokedAt: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(connectedProjectMappings)
    .set({ status: 'revoked', revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(connectedProjectMappings.id, mappingId),
        eq(connectedProjectMappings.developerOrganizationId, developerOrganizationId),
        isNull(connectedProjectMappings.revokedAt),
      ),
    )
    .returning({ id: connectedProjectMappings.id });
  return rows.length > 0;
}
