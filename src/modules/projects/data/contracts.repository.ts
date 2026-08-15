import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { contractValueEvents, contracts, profiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ContractRecord,
  ContractTaxSnapshotRecord,
  ContractType,
  ContractValueEventRecord,
} from '../domain/types';
import { CONTRACT_TYPES } from '../domain/types';

function mapTaxSnapshot(value: unknown): ContractTaxSnapshotRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ContractTaxSnapshotRecord>;
  if (typeof row.enteredAmount !== 'string' || typeof row.netAmount !== 'string') return null;
  return {
    enteredAmount: row.enteredAmount,
    amountIncludesTax: Boolean(row.amountIncludesTax),
    netAmount: row.netAmount,
    taxAmount: typeof row.taxAmount === 'string' ? row.taxAmount : '0.000000',
    grossAmount: typeof row.grossAmount === 'string' ? row.grossAmount : row.netAmount,
    currency: typeof row.currency === 'string' ? row.currency : '',
    ratePercent: row.ratePercent ?? null,
    method: row.method ?? null,
    ruleId: row.ruleId ?? null,
    ruleKey: row.ruleKey ?? null,
    ruleName: row.ruleName ?? null,
    capturedAt: typeof row.capturedAt === 'string' ? row.capturedAt : '',
  };
}

function mapContractType(value: string | null | undefined, isPrimary: boolean): ContractType {
  if (value && (CONTRACT_TYPES as readonly string[]).includes(value)) {
    return value as ContractType;
  }
  return isPrimary ? 'primary' : 'additional';
}

function mapContract(row: typeof contracts.$inferSelect): ContractRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    isPrimary: row.isPrimary,
    contractType: mapContractType(row.contractType, row.isPrimary),
    contractNumber: row.contractNumber,
    clientId: row.clientId,
    startDate: row.startDate,
    endDate: row.endDate,
    retentionPercent: row.retentionPercent,
    name: row.name,
    reference: row.reference,
    status: row.status,
    enteredValueAmount: row.enteredValueAmount,
    amountIncludesTax: row.amountIncludesTax,
    originalValueAmount: row.originalValueAmount,
    originalTaxAmount: row.originalTaxAmount,
    originalGrossAmount: row.originalGrossAmount,
    displayOriginalEnteredAmount: row.displayOriginalEnteredAmount,
    displayOriginalNetAmount: row.displayOriginalNetAmount,
    displayOriginalTaxAmount: row.displayOriginalTaxAmount,
    displayOriginalGrossAmount: row.displayOriginalGrossAmount,
    openingReductionEnteredAmount: row.openingReductionEnteredAmount,
    openingReductionNetAmount: row.openingReductionNetAmount,
    openingReductionTaxAmount: row.openingReductionTaxAmount,
    openingReductionGrossAmount: row.openingReductionGrossAmount,
    taxSnapshot: mapTaxSnapshot(row.taxSnapshot),
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
    contractType?: ContractType;
    contractNumber?: string | null;
    clientId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    retentionPercent?: string | null;
    name?: string | null;
    reference?: string | null;
    status?: 'draft' | 'active' | 'closed' | 'cancelled';
    enteredValueAmount?: string | null;
    amountIncludesTax?: boolean;
    originalValueAmount?: string | null;
    originalTaxAmount?: string | null;
    originalGrossAmount?: string | null;
    displayOriginalEnteredAmount?: string | null;
    displayOriginalNetAmount?: string | null;
    displayOriginalTaxAmount?: string | null;
    displayOriginalGrossAmount?: string | null;
    openingReductionEnteredAmount?: string | null;
    openingReductionNetAmount?: string | null;
    openingReductionTaxAmount?: string | null;
    openingReductionGrossAmount?: string | null;
    taxSnapshot?: ContractTaxSnapshotRecord | null;
    currency: string;
    signedDate?: string | null;
    notes?: string | null;
  },
): Promise<ContractRecord> {
  const isPrimary = input.isPrimary ?? true;
  const contractType =
    input.contractType ?? (isPrimary ? 'primary' : 'additional');
  const [row] = await db
    .insert(contracts)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      isPrimary,
      contractType,
      contractNumber: input.contractNumber ?? null,
      clientId: input.clientId ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      retentionPercent: input.retentionPercent ?? null,
      name: input.name ?? null,
      reference: input.reference ?? null,
      status: input.status ?? 'active',
      enteredValueAmount: input.enteredValueAmount ?? null,
      amountIncludesTax: input.amountIncludesTax ?? false,
      originalValueAmount: input.originalValueAmount ?? null,
      originalTaxAmount: input.originalTaxAmount ?? null,
      originalGrossAmount: input.originalGrossAmount ?? null,
      displayOriginalEnteredAmount: input.displayOriginalEnteredAmount ?? null,
      displayOriginalNetAmount: input.displayOriginalNetAmount ?? null,
      displayOriginalTaxAmount: input.displayOriginalTaxAmount ?? null,
      displayOriginalGrossAmount: input.displayOriginalGrossAmount ?? null,
      openingReductionEnteredAmount: input.openingReductionEnteredAmount ?? null,
      openingReductionNetAmount: input.openingReductionNetAmount ?? null,
      openingReductionTaxAmount: input.openingReductionTaxAmount ?? null,
      openingReductionGrossAmount: input.openingReductionGrossAmount ?? null,
      taxSnapshot: (input.taxSnapshot as unknown as Record<string, unknown> | null) ?? null,
      currency: input.currency,
      signedDate: input.signedDate ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapContract(row!);
}

export async function updateContractAmounts(
  db: DbExecutor,
  organizationId: string,
  contractId: string,
  patch: {
    enteredValueAmount: string;
    amountIncludesTax: boolean;
    originalValueAmount: string;
    originalTaxAmount: string;
    originalGrossAmount: string;
    displayOriginalEnteredAmount: string | null;
    displayOriginalNetAmount: string | null;
    displayOriginalTaxAmount: string | null;
    displayOriginalGrossAmount: string | null;
    openingReductionEnteredAmount: string | null;
    openingReductionNetAmount: string | null;
    openingReductionTaxAmount: string | null;
    openingReductionGrossAmount: string | null;
    taxSnapshot: ContractTaxSnapshotRecord;
    currency: string;
  },
): Promise<ContractRecord | null> {
  const [row] = await db
    .update(contracts)
    .set({
      enteredValueAmount: patch.enteredValueAmount,
      amountIncludesTax: patch.amountIncludesTax,
      originalValueAmount: patch.originalValueAmount,
      originalTaxAmount: patch.originalTaxAmount,
      originalGrossAmount: patch.originalGrossAmount,
      displayOriginalEnteredAmount: patch.displayOriginalEnteredAmount,
      displayOriginalNetAmount: patch.displayOriginalNetAmount,
      displayOriginalTaxAmount: patch.displayOriginalTaxAmount,
      displayOriginalGrossAmount: patch.displayOriginalGrossAmount,
      openingReductionEnteredAmount: patch.openingReductionEnteredAmount,
      openingReductionNetAmount: patch.openingReductionNetAmount,
      openingReductionTaxAmount: patch.openingReductionTaxAmount,
      openingReductionGrossAmount: patch.openingReductionGrossAmount,
      taxSnapshot: patch.taxSnapshot as unknown as Record<string, unknown>,
      currency: patch.currency,
      updatedAt: new Date(),
    })
    .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)))
    .returning();

  return row ? mapContract(row) : null;
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

export async function updateContractValueEventAmount(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
  patch: { amount: string; reason?: string | null },
): Promise<ContractValueEventRecord | null> {
  const [row] = await db
    .update(contractValueEvents)
    .set({
      amount: patch.amount,
      reason: patch.reason ?? undefined,
    })
    .where(
      and(eq(contractValueEvents.id, eventId), eq(contractValueEvents.organizationId, organizationId)),
    )
    .returning();

  return row ? mapValueEvent(row) : null;
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

export async function findContractByNumber(
  db: DbExecutor,
  organizationId: string,
  contractNumber: string,
): Promise<ContractRecord | null> {
  const [row] = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        eq(contracts.contractNumber, contractNumber),
        isNull(contracts.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapContract(row) : null;
}

/** All non-archived contracts for a project — primary first, then created order. */
export async function listContractsByProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ContractRecord[]> {
  return listContractsForProjects(db, organizationId, [projectId]);
}

/** Non-archived contracts across many projects — primary first per project, then created order. */
export async function listContractsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<ContractRecord[]> {
  if (projectIds.length === 0) return [];

  const rows = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        inArray(contracts.projectId, [...projectIds]),
        isNull(contracts.archivedAt),
      ),
    )
    .orderBy(desc(contracts.isPrimary), asc(contracts.createdAt));

  return rows.map(mapContract);
}

export async function listContractValueEventsForContracts(
  db: DbExecutor,
  organizationId: string,
  contractIds: readonly string[],
): Promise<ContractValueEventRecord[]> {
  if (contractIds.length === 0) return [];

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
        inArray(contractValueEvents.contractId, [...contractIds]),
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

export interface ContractMetadataPatch {
  readonly name?: string | null;
  readonly reference?: string | null;
  readonly contractType?: ContractType;
  readonly contractNumber?: string | null;
  readonly clientId?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly retentionPercent?: string | null;
  readonly status?: 'draft' | 'active' | 'closed' | 'cancelled';
  readonly notes?: string | null;
  readonly signedDate?: string | null;
}

export async function updateContractMetadata(
  db: DbExecutor,
  organizationId: string,
  contractId: string,
  patch: ContractMetadataPatch,
): Promise<ContractRecord | null> {
  const set: {
    name?: string | null;
    reference?: string | null;
    contractType?: ContractType;
    contractNumber?: string | null;
    clientId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    retentionPercent?: string | null;
    status?: 'draft' | 'active' | 'closed' | 'cancelled';
    notes?: string | null;
    signedDate?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.reference !== undefined) set.reference = patch.reference;
  if (patch.contractType !== undefined) set.contractType = patch.contractType;
  if (patch.contractNumber !== undefined) set.contractNumber = patch.contractNumber;
  if (patch.clientId !== undefined) set.clientId = patch.clientId;
  if (patch.startDate !== undefined) set.startDate = patch.startDate;
  if (patch.endDate !== undefined) set.endDate = patch.endDate;
  if (patch.retentionPercent !== undefined) set.retentionPercent = patch.retentionPercent;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.signedDate !== undefined) set.signedDate = patch.signedDate;

  const [row] = await db
    .update(contracts)
    .set(set)
    .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)))
    .returning();

  return row ? mapContract(row) : null;
}

/** Clears the unique primary flag for every live contract on the project. */
export async function clearProjectPrimary(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<void> {
  await db
    .update(contracts)
    .set({
      isPrimary: false,
      contractType: 'additional',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        eq(contracts.projectId, projectId),
        eq(contracts.isPrimary, true),
        isNull(contracts.archivedAt),
      ),
    );
}

export async function markContractPrimary(
  db: DbExecutor,
  organizationId: string,
  contractId: string,
): Promise<ContractRecord | null> {
  const [row] = await db
    .update(contracts)
    .set({
      isPrimary: true,
      contractType: 'primary',
      updatedAt: new Date(),
    })
    .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)))
    .returning();

  return row ? mapContract(row) : null;
}

export async function unsetContractPrimary(
  db: DbExecutor,
  organizationId: string,
  contractId: string,
): Promise<ContractRecord | null> {
  const [row] = await db
    .update(contracts)
    .set({
      isPrimary: false,
      contractType: 'additional',
      updatedAt: new Date(),
    })
    .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)))
    .returning();

  return row ? mapContract(row) : null;
}
