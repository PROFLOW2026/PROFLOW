import { and, desc, eq } from 'drizzle-orm';
import { contractValueEvents, contracts } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ContractRecord, ContractValueEventRecord } from '../domain/types';

function mapContract(row: typeof contracts.$inferSelect): ContractRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    isPrimary: row.isPrimary,
    enteredValueAmount: row.enteredValueAmount,
    amountIncludesTax: row.amountIncludesTax,
    originalValueAmount: row.originalValueAmount,
    originalTaxAmount: row.originalTaxAmount,
    originalGrossAmount: row.originalGrossAmount,
    displayOriginalNetAmount: row.displayOriginalNetAmount,
    openingReductionNetAmount: row.openingReductionNetAmount,
    currency: row.currency,
  };
}

export async function findPrimaryContractForProject(
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
      ),
    )
    .limit(1);

  return row ? mapContract(row) : null;
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

export async function listContractValueEvents(
  db: DbExecutor,
  organizationId: string,
  contractId: string,
): Promise<ContractValueEventRecord[]> {
  const rows = await db
    .select()
    .from(contractValueEvents)
    .where(
      and(
        eq(contractValueEvents.organizationId, organizationId),
        eq(contractValueEvents.contractId, contractId),
      ),
    )
    .orderBy(desc(contractValueEvents.effectiveDate), desc(contractValueEvents.createdAt));

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    contractId: row.contractId,
    projectId: row.projectId,
    kind: row.kind as ContractValueEventRecord['kind'],
    amount: row.amount,
    currency: row.currency,
    changeOrderId: row.changeOrderId,
    effectiveDate: row.effectiveDate,
  }));
}

export async function insertContractValueEvent(
  db: DbExecutor,
  input: {
    organizationId: string;
    contractId: string;
    projectId: string;
    kind: ContractValueEventRecord['kind'];
    amount: string;
    currency: string;
    changeOrderId?: string | null;
    effectiveDate: string;
    reason?: string | null;
    actorUserId: string;
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
      changeOrderId: input.changeOrderId ?? null,
      effectiveDate: input.effectiveDate,
      reason: input.reason ?? null,
      actorUserId: input.actorUserId,
    })
    .returning();

  return {
    id: row!.id,
    organizationId: row!.organizationId,
    contractId: row!.contractId,
    projectId: row!.projectId,
    kind: row!.kind as ContractValueEventRecord['kind'],
    amount: row!.amount,
    currency: row!.currency,
    changeOrderId: row!.changeOrderId,
    effectiveDate: row!.effectiveDate,
  };
}
