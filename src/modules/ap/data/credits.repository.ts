/**
 * Vendor credit notes persistence (`ap_vendor_credits` / `ap_credit_applications`).
 * Credits ≠ payments — reduce Actual and outstanding when applied.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { apCreditApplications, apVendorCredits } from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import type { ApCreditApplicationStatus, ApCreditStatus } from '../domain/vendor-credits';

export type ApVendorCreditRow = typeof apVendorCredits.$inferSelect;
export type ApCreditApplicationRow = typeof apCreditApplications.$inferSelect;

export async function insertVendorCredit(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly vendorId: string;
    readonly apBillId?: string | null;
    readonly projectId?: string | null;
    readonly reference?: string | null;
    readonly creditDate: BusinessDate;
    readonly currency: string;
    readonly amount: string;
    readonly status?: ApCreditStatus;
    readonly notes?: string | null;
    readonly createdByUserId?: string | null;
  },
): Promise<ApVendorCreditRow> {
  const [row] = await db
    .insert(apVendorCredits)
    .values({
      organizationId: values.organizationId,
      vendorId: values.vendorId,
      apBillId: values.apBillId ?? null,
      projectId: values.projectId ?? null,
      reference: values.reference ?? null,
      creditDate: values.creditDate,
      currency: values.currency,
      amount: values.amount,
      status: values.status ?? 'open',
      notes: values.notes ?? null,
      createdByUserId: values.createdByUserId ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert vendor credit');
  return row;
}

export async function findVendorCreditById(
  db: DbExecutor,
  organizationId: string,
  creditId: string,
): Promise<ApVendorCreditRow | null> {
  const [row] = await db
    .select()
    .from(apVendorCredits)
    .where(
      and(
        eq(apVendorCredits.id, creditId),
        eq(apVendorCredits.organizationId, organizationId),
        isNull(apVendorCredits.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function lockVendorCreditForUpdate(
  db: DbExecutor,
  organizationId: string,
  creditId: string,
): Promise<ApVendorCreditRow | null> {
  const rows = await db.execute(sql`
    SELECT * FROM ap_vendor_credits
    WHERE id = ${creditId}
      AND organization_id = ${organizationId}
      AND archived_at IS NULL
    FOR UPDATE
  `);
  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: ApVendorCreditRow[] }).rows ?? []);
  const raw = list[0] as Record<string, unknown> | undefined;
  if (!raw) return null;
  return mapCreditRow(raw);
}

function mapCreditRow(raw: Record<string, unknown>): ApVendorCreditRow {
  return {
    id: String(raw.id),
    organizationId: String(raw.organization_id ?? raw.organizationId),
    vendorId: String(raw.vendor_id ?? raw.vendorId),
    apBillId: (raw.ap_bill_id ?? raw.apBillId ?? null) as string | null,
    projectId: (raw.project_id ?? raw.projectId ?? null) as string | null,
    reference: (raw.reference ?? null) as string | null,
    creditDate: String(raw.credit_date ?? raw.creditDate),
    currency: String(raw.currency),
    amount: String(raw.amount),
    status: String(raw.status) as ApCreditStatus,
    notes: (raw.notes ?? null) as string | null,
    voidedAt: (raw.voided_at ?? raw.voidedAt ?? null) as Date | null,
    createdByUserId: (raw.created_by_user_id ?? raw.createdByUserId ?? null) as string | null,
    archivedAt: (raw.archived_at ?? raw.archivedAt ?? null) as Date | null,
    createdAt: (raw.created_at ?? raw.createdAt) as Date,
    updatedAt: (raw.updated_at ?? raw.updatedAt) as Date,
  };
}

export async function updateVendorCreditStatus(
  db: DbExecutor,
  organizationId: string,
  creditId: string,
  status: ApCreditStatus,
  voidedAt?: Date | null,
): Promise<ApVendorCreditRow | null> {
  const [row] = await db
    .update(apVendorCredits)
    .set({
      status,
      voidedAt: voidedAt === undefined ? undefined : voidedAt,
      updatedAt: new Date(),
    })
    .where(
      and(eq(apVendorCredits.id, creditId), eq(apVendorCredits.organizationId, organizationId)),
    )
    .returning();
  return row ?? null;
}

export async function insertCreditApplication(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly creditId: string;
    readonly apBillId: string;
    readonly amount: string;
    readonly currency: string;
    readonly createdByUserId?: string | null;
  },
): Promise<ApCreditApplicationRow> {
  const [row] = await db
    .insert(apCreditApplications)
    .values({
      organizationId: values.organizationId,
      creditId: values.creditId,
      apBillId: values.apBillId,
      amount: values.amount,
      currency: values.currency,
      status: 'applied',
      createdByUserId: values.createdByUserId ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert credit application');
  return row;
}

export async function listActiveCreditAmountsForBill(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<string[]> {
  const rows = await db
    .select({ amount: apCreditApplications.amount })
    .from(apCreditApplications)
    .where(
      and(
        eq(apCreditApplications.organizationId, organizationId),
        eq(apCreditApplications.apBillId, apBillId),
        eq(apCreditApplications.status, 'applied'),
      ),
    );
  return rows.map((r) => r.amount);
}

export async function listActiveCreditAmountsForBills(
  db: DbExecutor,
  organizationId: string,
  billIds: readonly string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (billIds.length === 0) return map;
  const rows = await db
    .select({
      apBillId: apCreditApplications.apBillId,
      amount: apCreditApplications.amount,
    })
    .from(apCreditApplications)
    .where(
      and(
        eq(apCreditApplications.organizationId, organizationId),
        inArray(apCreditApplications.apBillId, [...billIds]),
        eq(apCreditApplications.status, 'applied'),
      ),
    );
  for (const row of rows) {
    const list = map.get(row.apBillId) ?? [];
    list.push(row.amount);
    map.set(row.apBillId, list);
  }
  return map;
}

export async function listActiveAppliedAmountsForCredit(
  db: DbExecutor,
  organizationId: string,
  creditId: string,
): Promise<string[]> {
  const rows = await db
    .select({ amount: apCreditApplications.amount })
    .from(apCreditApplications)
    .where(
      and(
        eq(apCreditApplications.organizationId, organizationId),
        eq(apCreditApplications.creditId, creditId),
        eq(apCreditApplications.status, 'applied'),
      ),
    );
  return rows.map((r) => r.amount);
}

export async function listCreditApplicationsForBill(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<
  readonly {
    readonly application: ApCreditApplicationRow;
    readonly credit: ApVendorCreditRow;
  }[]
> {
  const rows = await db
    .select({
      application: apCreditApplications,
      credit: apVendorCredits,
    })
    .from(apCreditApplications)
    .innerJoin(apVendorCredits, eq(apVendorCredits.id, apCreditApplications.creditId))
    .where(
      and(
        eq(apCreditApplications.organizationId, organizationId),
        eq(apCreditApplications.apBillId, apBillId),
      ),
    )
    .orderBy(desc(apCreditApplications.createdAt));
  return rows;
}

export async function listVendorCreditsForOrg(
  db: DbExecutor,
  organizationId: string,
  options: { readonly vendorId?: string; readonly limit?: number } = {},
): Promise<ApVendorCreditRow[]> {
  const conditions = [
    eq(apVendorCredits.organizationId, organizationId),
    isNull(apVendorCredits.archivedAt),
  ];
  if (options.vendorId) {
    conditions.push(eq(apVendorCredits.vendorId, options.vendorId));
  }
  return db
    .select()
    .from(apVendorCredits)
    .where(and(...conditions))
    .orderBy(desc(apVendorCredits.createdAt))
    .limit(options.limit ?? 100);
}

export type { ApCreditApplicationStatus };
