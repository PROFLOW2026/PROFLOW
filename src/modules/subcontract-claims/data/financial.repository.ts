import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  subcontractClaimPayableBases,
  subcontractClaims,
  subcontractDeductionDisputes,
  subcontractDeductions,
  subcontractPaymentHolds,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export type PayableBasisRow = typeof subcontractClaimPayableBases.$inferSelect;
export type DeductionRow = typeof subcontractDeductions.$inferSelect;
export type PaymentHoldRow = typeof subcontractPaymentHolds.$inferSelect;
export type DeductionDisputeRow = typeof subcontractDeductionDisputes.$inferSelect;

// ---------------------------------------------------------------- payable bases

export async function listBasesForAgreement(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<PayableBasisRow[]> {
  return db
    .select()
    .from(subcontractClaimPayableBases)
    .where(
      and(
        eq(subcontractClaimPayableBases.organizationId, organizationId),
        eq(subcontractClaimPayableBases.agreementId, agreementId),
      ),
    )
    .orderBy(asc(subcontractClaimPayableBases.createdAt), asc(subcontractClaimPayableBases.version));
}

export async function listBasesForClaims(
  db: DbExecutor,
  organizationId: string,
  claimIds: readonly string[],
): Promise<PayableBasisRow[]> {
  if (claimIds.length === 0) return [];
  return db
    .select()
    .from(subcontractClaimPayableBases)
    .where(
      and(
        eq(subcontractClaimPayableBases.organizationId, organizationId),
        inArray(subcontractClaimPayableBases.claimId, [...claimIds]),
      ),
    )
    .orderBy(asc(subcontractClaimPayableBases.version));
}

export async function findBasis(db: DbExecutor, organizationId: string, basisId: string): Promise<PayableBasisRow | null> {
  const [row] = await db
    .select()
    .from(subcontractClaimPayableBases)
    .where(and(eq(subcontractClaimPayableBases.organizationId, organizationId), eq(subcontractClaimPayableBases.id, basisId)))
    .limit(1);
  return row ?? null;
}

export async function insertBasis(
  db: DbExecutor,
  values: typeof subcontractClaimPayableBases.$inferInsert,
): Promise<string> {
  const id = values.id ?? crypto.randomUUID();
  await db.insert(subcontractClaimPayableBases).values({ ...values, id });
  return id;
}

/** Compare-and-set on the AP link; returns false when the basis was not in `from`. */
export async function moveBasisApStatus(
  db: DbExecutor,
  organizationId: string,
  basisId: string,
  from: PayableBasisRow['apBillStatus'],
  to: PayableBasisRow['apBillStatus'],
  apBillId: string | null = null,
): Promise<boolean> {
  const rows = await db
    .update(subcontractClaimPayableBases)
    .set({ apBillStatus: to, ...(apBillId ? { apBillId } : {}) })
    .where(
      and(
        eq(subcontractClaimPayableBases.organizationId, organizationId),
        eq(subcontractClaimPayableBases.id, basisId),
        eq(subcontractClaimPayableBases.apBillStatus, from),
      ),
    )
    .returning({ id: subcontractClaimPayableBases.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------- deductions

export interface DeductionListRow extends DeductionRow {
  readonly vendorName: string | null;
  readonly claimNumber: number | null;
}

export async function listDeductionRows(
  db: DbExecutor,
  organizationId: string,
  filter: {
    readonly projectId: string;
    readonly agreementId?: string | null;
    readonly vendorIds?: readonly string[];
    readonly limit?: number;
  },
): Promise<DeductionListRow[]> {
  const conditions = [
    eq(subcontractDeductions.organizationId, organizationId),
    eq(subcontractDeductions.projectId, filter.projectId),
  ];
  if (filter.agreementId) conditions.push(eq(subcontractDeductions.agreementId, filter.agreementId));
  if (filter.vendorIds) conditions.push(inArray(subcontractDeductions.vendorId, [...filter.vendorIds]));
  const rows = await db
    .select({ deduction: subcontractDeductions, vendorName: vendors.name, claimNumber: subcontractClaims.claimNumber })
    .from(subcontractDeductions)
    .leftJoin(
      vendors,
      and(eq(vendors.id, subcontractDeductions.vendorId), eq(vendors.organizationId, subcontractDeductions.organizationId)),
    )
    .leftJoin(
      subcontractClaims,
      and(
        eq(subcontractClaims.id, subcontractDeductions.claimId),
        eq(subcontractClaims.organizationId, subcontractDeductions.organizationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(subcontractDeductions.createdAt))
    .limit(filter.limit ?? 200);
  return rows.map((row) => ({ ...row.deduction, vendorName: row.vendorName, claimNumber: row.claimNumber }));
}

export async function listAgreementDeductionFacts(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<DeductionRow[]> {
  return db
    .select()
    .from(subcontractDeductions)
    .where(and(eq(subcontractDeductions.organizationId, organizationId), eq(subcontractDeductions.agreementId, agreementId)));
}

export async function findDeduction(db: DbExecutor, organizationId: string, deductionId: string): Promise<DeductionRow | null> {
  const [row] = await db
    .select()
    .from(subcontractDeductions)
    .where(and(eq(subcontractDeductions.organizationId, organizationId), eq(subcontractDeductions.id, deductionId)))
    .limit(1);
  return row ?? null;
}

export async function insertDeduction(
  db: DbExecutor,
  values: typeof subcontractDeductions.$inferInsert,
): Promise<string> {
  const id = values.id ?? crypto.randomUUID();
  await db.insert(subcontractDeductions).values({ ...values, id });
  return id;
}

export async function listDisputes(
  db: DbExecutor,
  organizationId: string,
  deductionIds: readonly string[],
): Promise<DeductionDisputeRow[]> {
  if (deductionIds.length === 0) return [];
  return db
    .select()
    .from(subcontractDeductionDisputes)
    .where(
      and(
        eq(subcontractDeductionDisputes.organizationId, organizationId),
        inArray(subcontractDeductionDisputes.deductionId, [...deductionIds]),
      ),
    )
    .orderBy(asc(subcontractDeductionDisputes.createdAt));
}

export async function insertDispute(
  db: DbExecutor,
  values: typeof subcontractDeductionDisputes.$inferInsert,
): Promise<string> {
  const id = values.id ?? crypto.randomUUID();
  await db.insert(subcontractDeductionDisputes).values({ ...values, id });
  return id;
}

// ---------------------------------------------------------------- payment holds

export async function listOpenHolds(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<PaymentHoldRow[]> {
  return db
    .select()
    .from(subcontractPaymentHolds)
    .where(
      and(
        eq(subcontractPaymentHolds.organizationId, organizationId),
        eq(subcontractPaymentHolds.agreementId, agreementId),
        isNull(subcontractPaymentHolds.releasedAt),
      ),
    )
    .orderBy(asc(subcontractPaymentHolds.createdAt));
}

export async function findHold(db: DbExecutor, organizationId: string, holdId: string): Promise<PaymentHoldRow | null> {
  const [row] = await db
    .select()
    .from(subcontractPaymentHolds)
    .where(and(eq(subcontractPaymentHolds.organizationId, organizationId), eq(subcontractPaymentHolds.id, holdId)))
    .limit(1);
  return row ?? null;
}

export async function insertHold(
  db: DbExecutor,
  values: typeof subcontractPaymentHolds.$inferInsert,
): Promise<string> {
  const id = values.id ?? crypto.randomUUID();
  await db.insert(subcontractPaymentHolds).values({ ...values, id });
  return id;
}

export async function releaseHoldRow(
  db: DbExecutor,
  organizationId: string,
  holdId: string,
  patch: { releasedByUserId: string; releaseNote: string | null },
): Promise<boolean> {
  const rows = await db
    .update(subcontractPaymentHolds)
    .set({ releasedAt: new Date(), releasedByUserId: patch.releasedByUserId, releaseNote: patch.releaseNote })
    .where(
      and(
        eq(subcontractPaymentHolds.organizationId, organizationId),
        eq(subcontractPaymentHolds.id, holdId),
        isNull(subcontractPaymentHolds.releasedAt),
      ),
    )
    .returning({ id: subcontractPaymentHolds.id });
  return rows.length > 0;
}
