import { and, eq } from 'drizzle-orm';
import { payments } from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import type { PaymentRecordStatus } from '../domain/types';

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
