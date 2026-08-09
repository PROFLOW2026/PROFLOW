import { and, asc, eq, isNull } from 'drizzle-orm';
import { contractValueEvents, contracts, profiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ContractRecord, ContractValueEventRecord } from '../domain/types';

function mapContract(row: typeof contracts.$inferSelect): ContractRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    isPrimary: row.isPrimary,
    name: row.name,
    reference: row.reference,
    status: row.status,
    originalValueAmount: row.originalValueAmount,
    currency: row.currency,
    signedDate: row.signedDate,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapValueEvent(
  row: typeof contractValueEvents.$inferSelect,
  actor?: { displayName: string | null; email: string | null },
): ContractValueEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    contractId: row.contractId,
    projectId: row.projectId,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    changeOrderId: row.changeOrderId,
    effectiveDate: row.effectiveDate,
    reason: row.reason,
    actorUserId: row.actorUserId,
    actorDisplayName: actor?.displayName ?? null,
    actorEmail: actor?.email ?? null,
    createdAt: row.createdAt,
  };
}

export async function insertContract(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    isPrimary?: boolean;
    name?: string | null;
    reference?: string | null;
    status?: 'draft' | 'active' | 'closed' | 'cancelled';
    originalValueAmount?: string | null;
    currency: string;
    signedDate?: string | null;
    notes?: string | null;
  },
): Promise<ContractRecord> {
  const [row] = await db
    .insert(contracts)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      isPrimary: input.isPrimary ?? true,
      name: input.name ?? null,
      reference: input.reference ?? null,
      status: input.status ?? 'active',
      originalValueAmount: input.originalValueAmount ?? null,
      currency: input.currency,
      signedDate: input.signedDate ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapContract(row!);
}

export async function insertContractValueEvent(
  db: DbExecutor,
  input: {
    organizationId: string;
    contractId: string;
    projectId: string;
    kind: string;
    amount: string;
    currency: string;
    effectiveDate: string;
    reason?: string | null;
    actorUserId?: string | null;
    changeOrderId?: string | null;
  },
): Promise<ContractValueEventRecord> {
  const [row] = await db
    .insert(contractValueEvents)
    .values({
      organizationId: input.organizationId,
      contractId: input.contractId,
      projectId: input.projectId,
      kind: input.kind,
      amount: input.amount,
      currency: input.currency,
      effectiveDate: input.effectiveDate,
      reason: input.reason ?? null,
      actorUserId: input.actorUserId ?? null,
      changeOrderId: input.changeOrderId ?? null,
    })
    .returning();

  return mapValueEvent(row!);
}

export async function findPrimaryContractByProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ContractRecord | null> {
  const [row] = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        eq(contracts.projectId, projectId),
        eq(contracts.isPrimary, true),
        isNull(contracts.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapContract(row) : null;
}

export async function listContractValueEvents(
  db: DbExecutor,
  organizationId: string,
  contractId: string,
): Promise<ContractValueEventRecord[]> {
  const rows = await db
    .select({
      event: contractValueEvents,
      actorDisplayName: profiles.displayName,
      actorEmail: profiles.email,
    })
    .from(contractValueEvents)
    .leftJoin(profiles, eq(profiles.id, contractValueEvents.actorUserId))
    .where(
      and(
        eq(contractValueEvents.organizationId, organizationId),
        eq(contractValueEvents.contractId, contractId),
      ),
    )
    .orderBy(asc(contractValueEvents.effectiveDate), asc(contractValueEvents.createdAt));

  return rows.map((row) =>
    mapValueEvent(row.event, {
      displayName: row.actorDisplayName,
      email: row.actorEmail,
    }),
  );
}

export async function findContractById(
  db: DbExecutor,
  organizationId: string,
  contractId: string,
): Promise<ContractRecord | null> {
  const [row] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)))
    .limit(1);

  return row ? mapContract(row) : null;
}
