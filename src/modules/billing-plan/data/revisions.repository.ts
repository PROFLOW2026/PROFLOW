import { and, asc, eq } from 'drizzle-orm';
import { projectBillingCycleRevisions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  BillingCycleStatus,
  ProjectBillingCycleLineRecord,
  ProjectBillingCycleRecord,
  ProjectBillingCycleRevisionRecord,
} from '../domain/types';

function mapRevision(
  row: typeof projectBillingCycleRevisions.$inferSelect,
): ProjectBillingCycleRevisionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    cycleId: row.cycleId,
    revisionNumber: row.revisionNumber,
    status: row.status as BillingCycleStatus,
    snapshotJson: row.snapshotJson,
    changeSummary: row.changeSummary ?? null,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt,
  };
}

export function buildCycleRevisionSnapshot(input: {
  readonly cycle: ProjectBillingCycleRecord;
  readonly lines: readonly ProjectBillingCycleLineRecord[];
}): Record<string, unknown> {
  return {
    cycle: {
      id: input.cycle.id,
      cycleNumber: input.cycle.cycleNumber,
      title: input.cycle.title,
      status: input.cycle.status,
      revisionNumber: input.cycle.revisionNumber,
      accountDate: input.cycle.accountDate,
      retentionPercent: input.cycle.retentionPercent,
      billingRecordId: input.cycle.billingRecordId,
      submittedAt: input.cycle.submittedAt,
    },
    lines: input.lines.map((line) => ({
      planLineId: line.planLineId,
      currentPercent: line.currentPercent,
      currentAmount: line.currentAmount,
      requestedPercent: line.requestedPercent,
      requestedAmount: line.requestedAmount,
      approvedPercent: line.approvedPercent,
      approvedAmount: line.approvedAmount,
      priorAmount: line.priorAmount,
      cumulativeAmount: line.cumulativeAmount,
      remainingAmount: line.remainingAmount,
      retentionAmount: line.retentionAmount,
    })),
  };
}

export async function insertRevision(
  db: DbExecutor,
  row: {
    organizationId: string;
    cycleId: string;
    revisionNumber: number;
    status: BillingCycleStatus;
    snapshotJson: unknown;
    changeSummary?: string | null;
    createdByUserId?: string | null;
  },
): Promise<ProjectBillingCycleRevisionRecord> {
  const [inserted] = await db
    .insert(projectBillingCycleRevisions)
    .values({
      organizationId: row.organizationId,
      cycleId: row.cycleId,
      revisionNumber: row.revisionNumber,
      status: row.status,
      snapshotJson: row.snapshotJson,
      changeSummary: row.changeSummary ?? null,
      createdByUserId: row.createdByUserId ?? null,
    })
    .returning();
  return mapRevision(inserted!);
}

export async function listRevisions(
  db: DbExecutor,
  organizationId: string,
  cycleId: string,
): Promise<ProjectBillingCycleRevisionRecord[]> {
  const rows = await db
    .select()
    .from(projectBillingCycleRevisions)
    .where(
      and(
        eq(projectBillingCycleRevisions.organizationId, organizationId),
        eq(projectBillingCycleRevisions.cycleId, cycleId),
      ),
    )
    .orderBy(asc(projectBillingCycleRevisions.revisionNumber));
  return rows.map(mapRevision);
}
