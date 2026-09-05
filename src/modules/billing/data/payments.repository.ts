import { and, desc, eq, inArray, notExists, or, sql } from 'drizzle-orm';
import {
  billingRecords,
  clients,
  paymentApplications,
  payments,
  projects,
} from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { fromNumericString } from '@/shared/money';
import type {
  BillingKind,
  PaymentApplicationFilters,
  PaymentApplicationRow,
  PaymentRecordStatus,
} from '../domain/types';

export interface PaymentInsertRow {
  readonly billingRecordId: string | null;
  readonly clientId?: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly paymentDate: BusinessDate;
  readonly method: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
}

export interface PaymentApplicationInsertRow {
  readonly paymentId: string;
  readonly billingRecordId: string;
  readonly appliedAmount: string;
  readonly currency: string;
}

export interface PaymentRecordRow {
  readonly id: string;
  readonly billingRecordId: string | null;
  readonly clientId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly status: PaymentRecordStatus;
  readonly paymentDate: string;
  readonly method: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
}

export interface UnallocatedPaymentRow {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string | null;
  readonly amount: string;
  readonly appliedAmount: string;
  readonly unallocatedAmount: string;
  readonly currency: string;
  readonly paymentDate: string;
  readonly method: string | null;
  readonly reference: string | null;
  readonly status: PaymentRecordStatus;
  readonly notes: string | null;
}

export interface BillingRecordPaymentRow {
  readonly id: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentDate: string;
  readonly method: string | null;
  readonly reference: string | null;
  readonly status: PaymentRecordStatus;
  readonly notes: string | null;
}

export interface PaidAmountRow {
  readonly billingRecordId: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: PaymentRecordStatus;
}

export async function insertPayment(
  db: DbExecutor,
  organizationId: string,
  row: PaymentInsertRow,
): Promise<string> {
  const [inserted] = await db
    .insert(payments)
    .values({
      organizationId,
      status: 'recorded',
      voidedAt: null,
      billingRecordId: row.billingRecordId,
      clientId: row.clientId ?? null,
      amount: row.amount,
      currency: row.currency,
      paymentDate: row.paymentDate,
      method: row.method,
      reference: row.reference,
      notes: row.notes,
      createdByUserId: row.createdByUserId,
    })
    .returning({ id: payments.id });

  return inserted!.id;
}

export async function insertPaymentApplications(
  db: DbExecutor,
  organizationId: string,
  rows: readonly PaymentApplicationInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await db.insert(paymentApplications).values(
    rows.map((row) => ({
      organizationId,
      paymentId: row.paymentId,
      billingRecordId: row.billingRecordId,
      appliedAmount: row.appliedAmount,
      currency: row.currency,
    })),
  );
}

export async function updatePaymentStatus(
  db: DbExecutor,
  organizationId: string,
  paymentId: string,
  status: PaymentRecordStatus,
  voidedAt: Date | null,
): Promise<void> {
  await db
    .update(payments)
    .set({ status, voidedAt })
    .where(and(eq(payments.organizationId, organizationId), eq(payments.id, paymentId)));
}

export async function findPaymentById(
  db: DbExecutor,
  organizationId: string,
  paymentId: string,
): Promise<PaymentRecordRow | null> {
  const [row] = await db
    .select({
      id: payments.id,
      billingRecordId: payments.billingRecordId,
      clientId: payments.clientId,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      paymentDate: payments.paymentDate,
      method: payments.method,
      reference: payments.reference,
      notes: payments.notes,
    })
    .from(payments)
    .where(and(eq(payments.organizationId, organizationId), eq(payments.id, paymentId)))
    .limit(1);

  return row ?? null;
}

/** Invoice ids touched by applications (or legacy billing_record_id). */
export async function listBillingRecordIdsForPayment(
  db: DbExecutor,
  organizationId: string,
  paymentId: string,
): Promise<readonly string[]> {
  const applicationRows = await db
    .select({ billingRecordId: paymentApplications.billingRecordId })
    .from(paymentApplications)
    .where(
      and(
        eq(paymentApplications.organizationId, organizationId),
        eq(paymentApplications.paymentId, paymentId),
      ),
    );

  if (applicationRows.length > 0) {
    return [...new Set(applicationRows.map((row) => row.billingRecordId))];
  }

  const payment = await findPaymentById(db, organizationId, paymentId);
  return payment?.billingRecordId ? [payment.billingRecordId] : [];
}

/**
 * Cash received that is not yet allocated to any invoice (customer credit / on-account).
 * Payment header − Σ applications for recorded payments in the given currency.
 */
export async function sumUnallocatedReceiptAmounts(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<string> {
  const paymentRows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
    })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.currency, currency),
        eq(payments.status, 'recorded'),
      ),
    );

  if (paymentRows.length === 0) return '0';

  const paymentIds = paymentRows.map((row) => row.id);
  const applicationRows = await db
    .select({
      paymentId: paymentApplications.paymentId,
      appliedAmount: paymentApplications.appliedAmount,
    })
    .from(paymentApplications)
    .where(
      and(
        eq(paymentApplications.organizationId, organizationId),
        inArray(paymentApplications.paymentId, paymentIds),
      ),
    );

  const appliedByPayment = new Map<string, number>();
  for (const row of applicationRows) {
    const prior = appliedByPayment.get(row.paymentId) ?? 0;
    appliedByPayment.set(row.paymentId, prior + Number(row.appliedAmount));
  }

  let total = 0;
  for (const row of paymentRows) {
    const remainder = Number(row.amount) - (appliedByPayment.get(row.id) ?? 0);
    if (remainder > 0) total += remainder;
  }

  return total.toFixed(2);
}

export async function findClientInOrganization(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)))
    .limit(1);
  return Boolean(row);
}

/** Lock invoices in id order before allocating applications. */
export async function lockBillingRecordsForUpdate(
  db: DbExecutor,
  organizationId: string,
  billingRecordIds: readonly string[],
): Promise<void> {
  if (billingRecordIds.length === 0) return;
  const sorted = [...new Set(billingRecordIds)].sort();
  await db.execute(sql`
    SELECT id
    FROM billing_records
    WHERE organization_id = ${organizationId}::uuid
      AND id IN (${sql.join(
        sorted.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    ORDER BY id
    FOR UPDATE
  `);
}

export async function lockPaymentForUpdate(
  db: DbExecutor,
  organizationId: string,
  paymentId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT id
    FROM payments
    WHERE id = ${paymentId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

/**
 * Applied amounts per invoice (all payment statuses), plus legacy 1:1 payments that
 * still have billing_record_id and no application rows.
 */
export async function listPaidAmountRowsByBillingRecordIds(
  db: DbExecutor,
  organizationId: string,
  billingRecordIds: readonly string[],
): Promise<PaidAmountRow[]> {
  if (billingRecordIds.length === 0) return [];

  const ids = [...billingRecordIds];

  const applicationRows = await db
    .select({
      billingRecordId: paymentApplications.billingRecordId,
      amount: paymentApplications.appliedAmount,
      currency: paymentApplications.currency,
      status: payments.status,
    })
    .from(paymentApplications)
    .innerJoin(payments, eq(payments.id, paymentApplications.paymentId))
    .where(
      and(
        eq(paymentApplications.organizationId, organizationId),
        eq(payments.organizationId, organizationId),
        inArray(paymentApplications.billingRecordId, ids),
      ),
    );

  const fallbackRows = await db
    .select({
      billingRecordId: payments.billingRecordId,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
    })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        inArray(payments.billingRecordId, ids),
        notExists(
          db
            .select({ id: paymentApplications.id })
            .from(paymentApplications)
            .where(eq(paymentApplications.paymentId, payments.id)),
        ),
      ),
    );

  const rows: PaidAmountRow[] = applicationRows.map((row) => ({
    billingRecordId: row.billingRecordId,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
  }));

  for (const row of fallbackRows) {
    if (!row.billingRecordId) continue;
    rows.push({
      billingRecordId: row.billingRecordId,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
    });
  }

  return rows;
}

export async function listActiveAppliedAmountsForBillingRecord(
  db: DbExecutor,
  organizationId: string,
  billingRecordId: string,
): Promise<readonly string[]> {
  const rows = await listPaidAmountRowsByBillingRecordIds(db, organizationId, [billingRecordId]);
  return rows.filter((row) => row.status === 'recorded').map((row) => row.amount);
}

/** Applied amounts on a payment header (recorded applications only). */
export async function listActiveAppliedAmountsForPayment(
  db: DbExecutor,
  organizationId: string,
  paymentId: string,
): Promise<readonly string[]> {
  const rows = await db
    .select({
      appliedAmount: paymentApplications.appliedAmount,
      status: payments.status,
    })
    .from(paymentApplications)
    .innerJoin(payments, eq(payments.id, paymentApplications.paymentId))
    .where(
      and(
        eq(paymentApplications.organizationId, organizationId),
        eq(payments.organizationId, organizationId),
        eq(paymentApplications.paymentId, paymentId),
        eq(payments.status, 'recorded'),
      ),
    );
  return rows.map((row) => row.appliedAmount);
}

/**
 * Recorded payments with a positive unallocated remainder (cash on account).
 */
export async function listUnallocatedPayments(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number; readonly clientId?: string } = {},
): Promise<UnallocatedPaymentRow[]> {
  const limit = options.limit ?? 50;
  const paymentRows = await db
    .select({
      id: payments.id,
      clientId: payments.clientId,
      clientName: clients.name,
      amount: payments.amount,
      currency: payments.currency,
      paymentDate: payments.paymentDate,
      method: payments.method,
      reference: payments.reference,
      status: payments.status,
      notes: payments.notes,
    })
    .from(payments)
    .leftJoin(clients, eq(clients.id, payments.clientId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.status, 'recorded'),
        options.clientId ? eq(payments.clientId, options.clientId) : undefined,
      ),
    )
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
    .limit(Math.min(limit * 4, 400));

  if (paymentRows.length === 0) return [];

  const paymentIds = paymentRows.map((row) => row.id);
  const applicationRows = await db
    .select({
      paymentId: paymentApplications.paymentId,
      appliedAmount: paymentApplications.appliedAmount,
    })
    .from(paymentApplications)
    .where(
      and(
        eq(paymentApplications.organizationId, organizationId),
        inArray(paymentApplications.paymentId, paymentIds),
      ),
    );

  const appliedByPayment = new Map<string, number>();
  for (const row of applicationRows) {
    const prior = appliedByPayment.get(row.paymentId) ?? 0;
    appliedByPayment.set(row.paymentId, prior + Number(row.appliedAmount));
  }

  const result: UnallocatedPaymentRow[] = [];
  for (const row of paymentRows) {
    if (!row.clientId) continue;
    const applied = appliedByPayment.get(row.id) ?? 0;
    const unallocated = Number(row.amount) - applied;
    if (unallocated <= 0) continue;
    result.push({
      id: row.id,
      clientId: row.clientId,
      clientName: row.clientName ?? null,
      amount: row.amount,
      appliedAmount: applied.toFixed(6),
      unallocatedAmount: unallocated.toFixed(6),
      currency: row.currency,
      paymentDate: row.paymentDate,
      method: row.method,
      reference: row.reference,
      status: row.status,
      notes: row.notes,
    });
    if (result.length >= limit) break;
  }
  return result;
}

export async function listPaymentRowsForBillingRecord(
  db: DbExecutor,
  organizationId: string,
  billingRecordId: string,
): Promise<BillingRecordPaymentRow[]> {
  const applicationRows = await db
    .select({
      id: payments.id,
      amount: paymentApplications.appliedAmount,
      currency: paymentApplications.currency,
      paymentDate: payments.paymentDate,
      method: payments.method,
      reference: payments.reference,
      status: payments.status,
      notes: payments.notes,
      createdAt: payments.createdAt,
    })
    .from(paymentApplications)
    .innerJoin(payments, eq(payments.id, paymentApplications.paymentId))
    .where(
      and(
        eq(paymentApplications.organizationId, organizationId),
        eq(payments.organizationId, organizationId),
        eq(paymentApplications.billingRecordId, billingRecordId),
      ),
    )
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt));

  const fallbackRows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      currency: payments.currency,
      paymentDate: payments.paymentDate,
      method: payments.method,
      reference: payments.reference,
      status: payments.status,
      notes: payments.notes,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.billingRecordId, billingRecordId),
        notExists(
          db
            .select({ id: paymentApplications.id })
            .from(paymentApplications)
            .where(eq(paymentApplications.paymentId, payments.id)),
        ),
      ),
    )
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt));

  return [...applicationRows, ...fallbackRows]
    .sort((a, b) => {
      const dateCmp = b.paymentDate.localeCompare(a.paymentDate);
      if (dateCmp !== 0) return dateCmp;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((row) => ({
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      paymentDate: row.paymentDate,
      method: row.method,
      reference: row.reference,
      status: row.status,
      notes: row.notes,
    }));
}

/**
 * Payment applications for AR history - applications table first, then legacy
 * 1:1 payments that still have billing_record_id and no application rows.
 */
export async function listPaymentApplications(
  db: DbExecutor,
  organizationId: string,
  filters: PaymentApplicationFilters = {},
): Promise<PaymentApplicationRow[]> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const includeVoided = filters.includeVoided ?? false;

  const applicationRows = await db
    .select({
      id: paymentApplications.id,
      paymentId: payments.id,
      billingRecordId: paymentApplications.billingRecordId,
      billingReference: billingRecords.reference,
      billingKind: billingRecords.kind,
      projectId: billingRecords.projectId,
      projectName: projects.name,
      amount: paymentApplications.appliedAmount,
      currency: paymentApplications.currency,
      paymentDate: payments.paymentDate,
      method: payments.method,
      reference: payments.reference,
      status: payments.status,
      notes: payments.notes,
      createdAt: payments.createdAt,
    })
    .from(paymentApplications)
    .innerJoin(payments, eq(payments.id, paymentApplications.paymentId))
    .innerJoin(billingRecords, eq(billingRecords.id, paymentApplications.billingRecordId))
    .leftJoin(projects, eq(projects.id, billingRecords.projectId))
    .where(
      and(
        eq(paymentApplications.organizationId, organizationId),
        eq(payments.organizationId, organizationId),
        eq(billingRecords.organizationId, organizationId),
        filters.projectId ? eq(billingRecords.projectId, filters.projectId) : undefined,
        filters.clientId
          ? or(
              eq(payments.clientId, filters.clientId),
              eq(billingRecords.clientId, filters.clientId),
              eq(projects.clientId, filters.clientId),
            )
          : undefined,
        includeVoided ? undefined : eq(payments.status, 'recorded'),
      ),
    )
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt));

  const fallbackRows = await db
    .select({
      id: payments.id,
      paymentId: payments.id,
      billingRecordId: payments.billingRecordId,
      billingReference: billingRecords.reference,
      billingKind: billingRecords.kind,
      projectId: billingRecords.projectId,
      projectName: projects.name,
      amount: payments.amount,
      currency: payments.currency,
      paymentDate: payments.paymentDate,
      method: payments.method,
      reference: payments.reference,
      status: payments.status,
      notes: payments.notes,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(billingRecords, eq(billingRecords.id, payments.billingRecordId))
    .leftJoin(projects, eq(projects.id, billingRecords.projectId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(billingRecords.organizationId, organizationId),
        notExists(
          db
            .select({ id: paymentApplications.id })
            .from(paymentApplications)
            .where(eq(paymentApplications.paymentId, payments.id)),
        ),
        filters.projectId ? eq(billingRecords.projectId, filters.projectId) : undefined,
        filters.clientId
          ? or(
              eq(payments.clientId, filters.clientId),
              eq(billingRecords.clientId, filters.clientId),
              eq(projects.clientId, filters.clientId),
            )
          : undefined,
        includeVoided ? undefined : eq(payments.status, 'recorded'),
      ),
    )
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt));

  const merged = [
    ...applicationRows.map((row) => ({
      ...row,
      billingRecordId: row.billingRecordId,
    })),
    ...fallbackRows.flatMap((row) =>
      row.billingRecordId
        ? [{ ...row, billingRecordId: row.billingRecordId }]
        : [],
    ),
  ]
    .sort((a, b) => {
      const dateCmp = b.paymentDate.localeCompare(a.paymentDate);
      if (dateCmp !== 0) return dateCmp;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(offset, offset + limit);

  return merged.map((row) => ({
    id: row.id,
    paymentId: row.paymentId,
    billingRecordId: row.billingRecordId,
    billingReference: row.billingReference,
    billingKind: row.billingKind as BillingKind,
    projectId: row.projectId,
    projectName: row.projectName,
    amount: fromNumericString(row.amount, row.currency)!,
    paymentDate: row.paymentDate as BusinessDate,
    method: row.method,
    reference: row.reference,
    status: row.status,
    notes: row.notes,
  }));
}
