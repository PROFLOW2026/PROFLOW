import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { subcontractAgreements, subcontractUnpricedWork } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { UnpricedWorkStatus, UnpricedWorkView } from '../domain/types';

const columns = {
  id: subcontractUnpricedWork.id,
  projectId: subcontractUnpricedWork.projectId,
  agreementId: subcontractUnpricedWork.agreementId,
  vendorId: subcontractUnpricedWork.vendorId,
  vendorName: sql<string | null>`app.dg_vendor_display_name(${subcontractUnpricedWork.organizationId}, ${subcontractUnpricedWork.vendorId})`,
  agreementTitle: subcontractAgreements.title,
  title: subcontractUnpricedWork.title,
  scopeDescription: subcontractUnpricedWork.scopeDescription,
  locationId: subcontractUnpricedWork.locationId,
  workPackageId: subcontractUnpricedWork.workPackageId,
  workDate: subcontractUnpricedWork.workDate,
  issuerName: subcontractUnpricedWork.issuerName,
  status: subcontractUnpricedWork.status,
  convertedChangeId: subcontractUnpricedWork.convertedChangeId,
  decisionReason: subcontractUnpricedWork.decisionReason,
  createdAt: subcontractUnpricedWork.createdAt,
};

export async function listProjectUnpricedWork(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  options: { statuses?: readonly UnpricedWorkStatus[]; agreementId?: string; limit?: number; offset?: number } = {},
): Promise<UnpricedWorkView[]> {
  return db
    .select(columns)
    .from(subcontractUnpricedWork)
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, subcontractUnpricedWork.agreementId),
        eq(subcontractAgreements.organizationId, subcontractUnpricedWork.organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractUnpricedWork.organizationId, organizationId),
        eq(subcontractUnpricedWork.projectId, projectId),
        options.statuses?.length ? inArray(subcontractUnpricedWork.status, [...options.statuses]) : undefined,
        options.agreementId ? eq(subcontractUnpricedWork.agreementId, options.agreementId) : undefined,
      ),
    )
    .orderBy(desc(subcontractUnpricedWork.workDate), desc(subcontractUnpricedWork.createdAt))
    .limit(Math.min(options.limit ?? 100, 200))
    .offset(options.offset ?? 0);
}

export async function lockUnpricedWork(db: DbExecutor, organizationId: string, id: string) {
  const [row] = await db
    .select({
      id: subcontractUnpricedWork.id,
      projectId: subcontractUnpricedWork.projectId,
      agreementId: subcontractUnpricedWork.agreementId,
      vendorId: subcontractUnpricedWork.vendorId,
      title: subcontractUnpricedWork.title,
      scopeDescription: subcontractUnpricedWork.scopeDescription,
      status: subcontractUnpricedWork.status,
    })
    .from(subcontractUnpricedWork)
    .where(and(eq(subcontractUnpricedWork.organizationId, organizationId), eq(subcontractUnpricedWork.id, id)))
    .for('update')
    .limit(1);
  return row ?? null;
}

export async function findUnpricedWorkScope(db: DbExecutor, organizationId: string, id: string) {
  const [row] = await db
    .select({
      projectId: subcontractUnpricedWork.projectId,
      agreementId: subcontractUnpricedWork.agreementId,
      vendorId: subcontractUnpricedWork.vendorId,
    })
    .from(subcontractUnpricedWork)
    .where(and(eq(subcontractUnpricedWork.organizationId, organizationId), eq(subcontractUnpricedWork.id, id)))
    .limit(1);
  return row ?? null;
}

export async function insertUnpricedWork(
  db: DbExecutor,
  values: typeof subcontractUnpricedWork.$inferInsert,
): Promise<string> {
  const [row] = await db.insert(subcontractUnpricedWork).values(values).returning({ id: subcontractUnpricedWork.id });
  return row!.id;
}

export async function updateUnpricedWorkRow(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<typeof subcontractUnpricedWork.$inferInsert>,
): Promise<boolean> {
  const rows = await db
    .update(subcontractUnpricedWork)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(subcontractUnpricedWork.organizationId, organizationId),
        eq(subcontractUnpricedWork.id, id),
        eq(subcontractUnpricedWork.status, 'recorded'),
      ),
    )
    .returning({ id: subcontractUnpricedWork.id });
  return rows.length > 0;
}

export async function countOpenUnpricedWork(db: DbExecutor, organizationId: string, agreementId: string): Promise<number> {
  const rows = await db
    .select({ id: subcontractUnpricedWork.id })
    .from(subcontractUnpricedWork)
    .where(
      and(
        eq(subcontractUnpricedWork.organizationId, organizationId),
        eq(subcontractUnpricedWork.agreementId, agreementId),
        eq(subcontractUnpricedWork.status, 'recorded'),
      ),
    );
  return rows.length;
}
