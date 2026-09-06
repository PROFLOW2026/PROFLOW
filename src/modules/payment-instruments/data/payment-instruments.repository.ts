import { and, asc, eq } from 'drizzle-orm';
import { organizationPaymentInstruments } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { PaymentInstrumentRow } from '../domain/types';

export type { PaymentInstrumentRow } from '../domain/types';
export { formatPaymentInstrumentLabel } from '../domain/types';
export async function listActivePaymentInstruments(
  db: DbExecutor,
  organizationId: string,
): Promise<PaymentInstrumentRow[]> {
  const rows = await db
    .select({
      id: organizationPaymentInstruments.id,
      organizationId: organizationPaymentInstruments.organizationId,
      instrumentType: organizationPaymentInstruments.instrumentType,
      displayName: organizationPaymentInstruments.displayName,
      lastFour: organizationPaymentInstruments.lastFour,
      monthlyDebitDay: organizationPaymentInstruments.monthlyDebitDay,
      isActive: organizationPaymentInstruments.isActive,
    })
    .from(organizationPaymentInstruments)
    .where(
      and(
        eq(organizationPaymentInstruments.organizationId, organizationId),
        eq(organizationPaymentInstruments.isActive, true),
      ),
    )
    .orderBy(asc(organizationPaymentInstruments.displayName));

  return rows;
}

export async function findPaymentInstrumentById(
  db: DbExecutor,
  organizationId: string,
  instrumentId: string,
): Promise<PaymentInstrumentRow | null> {
  const [row] = await db
    .select({
      id: organizationPaymentInstruments.id,
      organizationId: organizationPaymentInstruments.organizationId,
      instrumentType: organizationPaymentInstruments.instrumentType,
      displayName: organizationPaymentInstruments.displayName,
      lastFour: organizationPaymentInstruments.lastFour,
      monthlyDebitDay: organizationPaymentInstruments.monthlyDebitDay,
      isActive: organizationPaymentInstruments.isActive,
    })
    .from(organizationPaymentInstruments)
    .where(
      and(
        eq(organizationPaymentInstruments.organizationId, organizationId),
        eq(organizationPaymentInstruments.id, instrumentId),
      ),
    )
    .limit(1);
  return row ?? null;
}
