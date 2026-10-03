import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  subcontractChangeVersionLines,
  subcontractChangeVersions,
  subcontractChanges,
} from '@drizzle/schema';
import { resultRowsOf } from './rows';
import type { DbExecutor } from '@/shared/db/types';
import type { ChangeOperationalView, ChangeVersionView, SubcontractChangeStatus } from '../domain/types';

const operationalColumns = {
  id: subcontractChanges.id,
  agreementId: subcontractChanges.agreementId,
  projectId: subcontractChanges.projectId,
  vendorId: subcontractChanges.vendorId,
  changeNumber: subcontractChanges.changeNumber,
  changeType: subcontractChanges.changeType,
  title: subcontractChanges.title,
  description: subcontractChanges.description,
  origin: subcontractChanges.origin,
  sourceEntityType: subcontractChanges.sourceEntityType,
  sourceEntityId: subcontractChanges.sourceEntityId,
  status: subcontractChanges.status,
  timeExtensionDays: subcontractChanges.timeExtensionDays,
  submittedAt: subcontractChanges.submittedAt,
  decidedAt: subcontractChanges.decidedAt,
  decisionReason: subcontractChanges.decisionReason,
  createdActorType: subcontractChanges.createdActorType,
  createdAt: subcontractChanges.createdAt,
};

export async function listAgreementChanges(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<(ChangeOperationalView & { approvedVersionId: string | null })[]> {
  return db
    .select({ ...operationalColumns, approvedVersionId: subcontractChanges.approvedVersionId })
    .from(subcontractChanges)
    .where(and(eq(subcontractChanges.organizationId, organizationId), eq(subcontractChanges.agreementId, agreementId)))
    .orderBy(desc(subcontractChanges.changeNumber))
    .limit(500);
}

export async function findChange(
  db: DbExecutor,
  organizationId: string,
  changeId: string,
): Promise<(ChangeOperationalView & { approvedVersionId: string | null }) | null> {
  const [row] = await db
    .select({ ...operationalColumns, approvedVersionId: subcontractChanges.approvedVersionId })
    .from(subcontractChanges)
    .where(and(eq(subcontractChanges.organizationId, organizationId), eq(subcontractChanges.id, changeId)))
    .limit(1);
  return row ?? null;
}

export async function lockChange(db: DbExecutor, organizationId: string, changeId: string) {
  const [row] = await db
    .select({ ...operationalColumns, approvedVersionId: subcontractChanges.approvedVersionId })
    .from(subcontractChanges)
    .where(and(eq(subcontractChanges.organizationId, organizationId), eq(subcontractChanges.id, changeId)))
    .for('update')
    .limit(1);
  return row ?? null;
}

export async function countOpenChanges(db: DbExecutor, organizationId: string, agreementId: string): Promise<number> {
  const rows = await db
    .select({ id: subcontractChanges.id })
    .from(subcontractChanges)
    .where(
      and(
        eq(subcontractChanges.organizationId, organizationId),
        eq(subcontractChanges.agreementId, agreementId),
        inArray(subcontractChanges.status, ['draft', 'submitted', 'under_negotiation']),
      ),
    );
  return rows.length;
}

export async function nextChangeNumber(db: DbExecutor, organizationId: string, agreementId: string): Promise<number> {
  const result = await db.execute(
    sql`select app.next_subcontract_change_number(${organizationId}::uuid, ${agreementId}::uuid) as n`,
  );
  return Number(resultRowsOf<{ n: number }>(result)[0]!.n);
}

export async function nextVersionNo(db: DbExecutor, organizationId: string, changeId: string): Promise<number> {
  const result = await db.execute(
    sql`select app.next_subcontract_change_version_no(${organizationId}::uuid, ${changeId}::uuid) as n`,
  );
  return Number(resultRowsOf<{ n: number }>(result)[0]!.n);
}

/** No RETURNING: external principals insert rows they may not be allowed to SELECT back in every state. */
export async function insertChange(db: DbExecutor, values: typeof subcontractChanges.$inferInsert): Promise<void> {
  await db.insert(subcontractChanges).values(values);
}

export async function updateChangeRow(
  db: DbExecutor,
  organizationId: string,
  changeId: string,
  patch: Partial<typeof subcontractChanges.$inferInsert>,
  fromStatuses: readonly SubcontractChangeStatus[],
): Promise<boolean> {
  const rows = await db
    .update(subcontractChanges)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(subcontractChanges.organizationId, organizationId),
        eq(subcontractChanges.id, changeId),
        inArray(subcontractChanges.status, [...fromStatuses]),
      ),
    )
    .returning({ id: subcontractChanges.id });
  return rows.length > 0;
}

export async function insertVersion(
  db: DbExecutor,
  version: typeof subcontractChangeVersions.$inferInsert,
  lines: readonly Omit<typeof subcontractChangeVersionLines.$inferInsert, 'versionId'>[],
): Promise<void> {
  await db.insert(subcontractChangeVersions).values(version);
  if (lines.length > 0) {
    await db.insert(subcontractChangeVersionLines).values(lines.map((line) => ({ ...line, versionId: version.id! })));
  }
}

/** FINANCIAL: versions with their lines for a set of changes (one query each, no N+1). */
export async function listVersionsForChanges(
  db: DbExecutor,
  organizationId: string,
  changeIds: readonly string[],
): Promise<Map<string, ChangeVersionView[]>> {
  const result = new Map<string, ChangeVersionView[]>();
  if (changeIds.length === 0) return result;
  const versions = await db
    .select({
      id: subcontractChangeVersions.id,
      changeId: subcontractChangeVersions.changeId,
      versionNo: subcontractChangeVersions.versionNo,
      amount: subcontractChangeVersions.amount,
      currency: subcontractChangeVersions.currency,
      timeExtensionDays: subcontractChangeVersions.timeExtensionDays,
      note: subcontractChangeVersions.note,
      actorType: subcontractChangeVersions.actorType,
      createdAt: subcontractChangeVersions.createdAt,
    })
    .from(subcontractChangeVersions)
    .where(
      and(
        eq(subcontractChangeVersions.organizationId, organizationId),
        inArray(subcontractChangeVersions.changeId, [...changeIds]),
      ),
    )
    .orderBy(asc(subcontractChangeVersions.versionNo));
  const versionIds = versions.map((version) => version.id);
  const lines =
    versionIds.length === 0
      ? []
      : await db
          .select({
            id: subcontractChangeVersionLines.id,
            versionId: subcontractChangeVersionLines.versionId,
            workLineId: subcontractChangeVersionLines.workLineId,
            newLineCode: subcontractChangeVersionLines.newLineCode,
            newLineDescription: subcontractChangeVersionLines.newLineDescription,
            newLineUnit: subcontractChangeVersionLines.newLineUnit,
            newLineType: subcontractChangeVersionLines.newLineType,
            quantityDelta: subcontractChangeVersionLines.quantityDelta,
            unitRate: subcontractChangeVersionLines.unitRate,
            amountDelta: subcontractChangeVersionLines.amountDelta,
          })
          .from(subcontractChangeVersionLines)
          .where(
            and(
              eq(subcontractChangeVersionLines.organizationId, organizationId),
              inArray(subcontractChangeVersionLines.versionId, versionIds),
            ),
          )
          .orderBy(asc(subcontractChangeVersionLines.sortOrder));
  const linesByVersion = new Map<string, ChangeVersionView['lines'][number][]>();
  for (const { versionId, ...line } of lines) {
    const list = linesByVersion.get(versionId) ?? [];
    list.push(line);
    linesByVersion.set(versionId, list);
  }
  for (const { changeId, ...version } of versions) {
    const list = result.get(changeId) ?? [];
    list.push({ ...version, lines: linesByVersion.get(version.id) ?? [] });
    result.set(changeId, list);
  }
  return result;
}
