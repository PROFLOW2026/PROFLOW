import { and, desc, eq, inArray } from 'drizzle-orm';
import { safetyActionTaskLinks, safetyRecordContractorLinks, safetyRecords } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { SafetyRecordStatus, SafetySeverity } from '../domain/types';
import type { ContractorSafetyRecord, ContractorSafetyRecordType } from './domain';

const S = safetyRecords;
const L = safetyRecordContractorLinks;

/** Never selects `people_involved` (personal data stays in the internal safety module). */
const columns = {
  id: S.id,
  organizationId: S.organizationId,
  projectId: L.projectId,
  vendorId: L.vendorId,
  subcontractAgreementId: L.subcontractAgreementId,
  locationId: L.locationId,
  recordType: S.recordType,
  severity: S.severity,
  title: S.title,
  description: S.description,
  immediateAction: S.immediateAction,
  occurredAt: S.occurredAt,
  status: S.status,
  dueDate: L.dueDate,
  contractorVisible: L.contractorVisible,
  reportedActorType: L.reportedActorType,
  reportedByUserId: L.reportedByUserId,
  reportedByPrincipalId: L.reportedByPrincipalId,
  closedAt: S.closedAt,
  closureVerifiedAt: L.closureVerifiedAt,
  closureVerificationNote: L.closureVerificationNote,
  createdAt: S.createdAt,
};

type Row = { [K in keyof typeof columns]: unknown } & Record<string, unknown>;

function map(row: Row): ContractorSafetyRecord {
  return {
    ...(row as unknown as ContractorSafetyRecord),
    recordType: row.recordType as ContractorSafetyRecordType,
    severity: row.severity as SafetySeverity,
    status: row.status as SafetyRecordStatus,
  };
}

export interface ContractorSafetyFilter {
  readonly projectId: string;
  readonly vendorId?: string;
  readonly statuses?: readonly SafetyRecordStatus[];
  readonly limit?: number;
}

export async function listContractorSafetyRecords(
  db: DbExecutor,
  organizationId: string,
  filter: ContractorSafetyFilter,
): Promise<ContractorSafetyRecord[]> {
  const rows = await db
    .select(columns)
    .from(L)
    .innerJoin(S, and(eq(S.id, L.safetyRecordId), eq(S.organizationId, L.organizationId)))
    .where(
      and(
        eq(L.organizationId, organizationId),
        eq(L.projectId, filter.projectId),
        filter.vendorId ? eq(L.vendorId, filter.vendorId) : undefined,
        filter.statuses && filter.statuses.length > 0 ? inArray(S.status, [...filter.statuses]) : undefined,
      ),
    )
    .orderBy(desc(S.occurredAt))
    .limit(Math.min(Math.max(filter.limit ?? 200, 1), 500));
  return rows.map((row) => map(row as Row));
}

export async function findContractorSafetyRecord(
  db: DbExecutor,
  organizationId: string,
  recordId: string,
): Promise<ContractorSafetyRecord | null> {
  const [row] = await db
    .select(columns)
    .from(L)
    .innerJoin(S, and(eq(S.id, L.safetyRecordId), eq(S.organizationId, L.organizationId)))
    .where(and(eq(L.organizationId, organizationId), eq(L.safetyRecordId, recordId)))
    .limit(1);
  return row ? map(row as Row) : null;
}

export async function insertContractorLink(
  db: DbExecutor,
  values: typeof L.$inferInsert,
): Promise<void> {
  await db.insert(L).values(values);
}

export async function updateContractorLink(
  db: DbExecutor,
  organizationId: string,
  recordId: string,
  patch: Partial<{
    dueDate: string | null;
    contractorVisible: boolean;
    closureVerifiedAt: Date | null;
    closureVerifiedByUserId: string | null;
    closureVerificationNote: string | null;
  }>,
): Promise<void> {
  await db
    .update(L)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(L.organizationId, organizationId), eq(L.safetyRecordId, recordId)));
}

export async function listActionTaskLinks(
  db: DbExecutor,
  organizationId: string,
  recordId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ actionId: safetyActionTaskLinks.correctiveActionId, taskId: safetyActionTaskLinks.taskId })
    .from(safetyActionTaskLinks)
    .where(and(eq(safetyActionTaskLinks.organizationId, organizationId), eq(safetyActionTaskLinks.safetyRecordId, recordId)));
  return new Map(rows.map((row) => [row.actionId, row.taskId]));
}

export async function insertActionTaskLink(
  db: DbExecutor,
  values: typeof safetyActionTaskLinks.$inferInsert,
): Promise<void> {
  await db.insert(safetyActionTaskLinks).values(values);
}
