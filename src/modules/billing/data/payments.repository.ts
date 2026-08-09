import { and, desc, eq } from 'drizzle-orm';
import { billingRecords, payments, projects } from '@drizzle/schema';
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
  readonly billingRecordId: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentDate: BusinessDate;
  readonly method: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
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
      ...row,
    })
    .returning({ id: payments.id });

  return inserted!.id;
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
): Promise<{
  id: string;
  billingRecordId: string;
  amount: string;
  currency: string;
  status: PaymentRecordStatus;
} | null> {
  const [row] = await db
    .select({
      id: payments.id,
      billingRecordId: payments.billingRecordId,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
    })
    .from(payments)
    .where(and(eq(payments.organizationId, organizationId), eq(payments.id, paymentId)))
    .limit(1);

  return row ?? null;
}

/**
 * Payment applications for AR history — joins existing payments to billing records.
 * Does not invent a separate ledger or rewrite application accounting.
 */
export async function listPaymentApplications(
  db: DbExecutor,
  organizationId: string,
  filters: PaymentApplicationFilters = {},
): Promise<PaymentApplicationRow[]> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const includeVoided = filters.includeVoided ?? false;

  const rows = await db
    .select({
      id: payments.id,
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
    })
    .from(payments)
    .innerJoin(billingRecords, eq(billingRecords.id, payments.billingRecordId))
    .leftJoin(projects, eq(projects.id, billingRecords.projectId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(billingRecords.organizationId, organizationId),
        filters.projectId ? eq(billingRecords.projectId, filters.projectId) : undefined,
        includeVoided ? undefined : eq(payments.status, 'recorded'),
      ),
    )
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    id: row.id,
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
