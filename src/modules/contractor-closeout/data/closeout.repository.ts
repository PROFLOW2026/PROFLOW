import { and, eq } from 'drizzle-orm';
import {
  contractorWarrantyReports,
  entityLinks,
  subcontractAgreementCloseouts,
  subcontractCloseoutChecklistItems,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function findCloseoutForAgreement(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<(typeof subcontractAgreementCloseouts.$inferSelect) | null> {
  const [row] = await db
    .select()
    .from(subcontractAgreementCloseouts)
    .where(
      and(
        eq(subcontractAgreementCloseouts.organizationId, organizationId),
        eq(subcontractAgreementCloseouts.subcontractAgreementId, agreementId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertCloseout(
  db: DbExecutor,
  values: typeof subcontractAgreementCloseouts.$inferInsert,
): Promise<string> {
  const [row] = await db
    .insert(subcontractAgreementCloseouts)
    .values(values)
    .returning({ id: subcontractAgreementCloseouts.id });
  return row!.id;
}

export async function listProjectCloseouts(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<readonly (typeof subcontractAgreementCloseouts.$inferSelect)[]> {
  return db
    .select()
    .from(subcontractAgreementCloseouts)
    .where(
      and(
        eq(subcontractAgreementCloseouts.organizationId, organizationId),
        eq(subcontractAgreementCloseouts.projectId, projectId),
      ),
    );
}

export async function listChecklistItems(
  db: DbExecutor,
  organizationId: string,
  closeoutId: string,
): Promise<readonly (typeof subcontractCloseoutChecklistItems.$inferSelect)[]> {
  return db
    .select()
    .from(subcontractCloseoutChecklistItems)
    .where(
      and(
        eq(subcontractCloseoutChecklistItems.organizationId, organizationId),
        eq(subcontractCloseoutChecklistItems.closeoutId, closeoutId),
      ),
    )
    .orderBy(subcontractCloseoutChecklistItems.sortOrder);
}

export async function insertChecklistItem(
  db: DbExecutor,
  values: typeof subcontractCloseoutChecklistItems.$inferInsert,
): Promise<void> {
  await db.insert(subcontractCloseoutChecklistItems).values(values);
}

export async function updateChecklistItem(
  db: DbExecutor,
  organizationId: string,
  itemId: string,
  patch: Partial<typeof subcontractCloseoutChecklistItems.$inferInsert>,
): Promise<void> {
  await db
    .update(subcontractCloseoutChecklistItems)
    .set(patch)
    .where(
      and(
        eq(subcontractCloseoutChecklistItems.organizationId, organizationId),
        eq(subcontractCloseoutChecklistItems.id, itemId),
      ),
    );
}

export async function updateCloseout(
  db: DbExecutor,
  organizationId: string,
  closeoutId: string,
  patch: Partial<typeof subcontractAgreementCloseouts.$inferInsert>,
): Promise<void> {
  await db
    .update(subcontractAgreementCloseouts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(subcontractAgreementCloseouts.organizationId, organizationId), eq(subcontractAgreementCloseouts.id, closeoutId)),
    );
}

export async function insertWarrantyReport(
  db: DbExecutor,
  values: typeof contractorWarrantyReports.$inferInsert,
): Promise<string> {
  const [row] = await db.insert(contractorWarrantyReports).values(values).returning({ id: contractorWarrantyReports.id });
  return row!.id;
}

export async function linkWarrantyReportToDefect(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly reportId: string;
    readonly defectId: string;
    readonly createdByUserId: string | null;
  },
): Promise<void> {
  await db.insert(entityLinks).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceType: 'contractor_warranty_report',
    sourceId: input.reportId,
    targetType: 'defect',
    targetId: input.defectId,
    relation: 'warranty_defect',
    actorType: 'internal',
    actorUserId: input.createdByUserId,
  });
}

export async function listWarrantyReports(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<readonly (typeof contractorWarrantyReports.$inferSelect)[]> {
  return db
    .select()
    .from(contractorWarrantyReports)
    .where(
      and(eq(contractorWarrantyReports.organizationId, organizationId), eq(contractorWarrantyReports.projectId, projectId)),
    );
}
