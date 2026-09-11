import { and, desc, eq, isNull } from 'drizzle-orm';
import { billingRecords, contracts, projects } from '@drizzle/schema';
import type { ProjectBillingRows } from '@/modules/financials';
import { businessDate, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { fromNumericString, type MoneyValue } from '@/shared/money';
import {
  computeRecordRevenuePosition,
  deriveCollectionStatusFromOpen,
  type PaymentAmountInput,
} from '../domain/revenue-position';
import type { BillingKind, BillingRecordStatus, BillingRecordSummary } from '../domain/types';
import { listPaidAmountRowsByBillingRecordIds } from '../data/payments.repository';

function mapMoney(amount: string, currency: string): MoneyValue {
  return fromNumericString(amount, currency)!;
}

function buildRecordSummary(
  row: {
    id: string;
    projectId: string | null;
    projectName: string | null;
    clientId: string | null;
    contractId?: string | null;
    contractName?: string | null;
    reference: string | null;
    issueDate: string;
    dueDate: string | null;
    status: BillingRecordStatus;
    kind: BillingKind;
    totalAmount: string;
    subtotalAmount?: string;
    taxAmount?: string | null;
    currency: string;
    retentionAmount?: string;
    retentionHeldRemaining?: string;
  },
  payments: readonly PaymentAmountInput[],
  today: BusinessDate,
): BillingRecordSummary {
  const totalAmount = mapMoney(row.totalAmount, row.currency);
  const subtotalAmount = row.subtotalAmount
    ? mapMoney(row.subtotalAmount, row.currency)
    : totalAmount;
  const taxAmount =
    row.taxAmount != null && row.taxAmount !== ''
      ? mapMoney(row.taxAmount, row.currency)
      : null;
  const retentionHeldRemaining = row.retentionHeldRemaining
    ? mapMoney(row.retentionHeldRemaining, row.currency)
    : undefined;

  const position = computeRecordRevenuePosition(
    {
      kind: row.kind,
      status: row.status,
      totalAmount,
      subtotalAmount,
      taxAmount,
      payments,
      retentionHeldRemaining,
    },
    row.currency,
  );

  const paidAmount = position?.paid.net ?? mapMoney('0', row.currency);
  const paidGrossAmount = position?.paid.gross ?? mapMoney('0', row.currency);
  const outstandingAmount = position?.open.net ?? mapMoney('0', row.currency);
  const outstandingGrossAmount = position?.open.gross ?? mapMoney('0', row.currency);

  const collectionStatus = position
    ? deriveCollectionStatusFromOpen(
        position.open,
        position.paid,
        row.dueDate as BusinessDate | null,
        today,
        row.status,
      )
    : null;

  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    contractId: row.contractId ?? null,
    contractName: row.contractName ?? null,
    clientId: row.clientId,
    reference: row.reference,
    issueDate: row.issueDate as BusinessDate,
    dueDate: row.dueDate as BusinessDate | null,
    status: row.status,
    kind: row.kind,
    totalAmount,
    subtotalAmount,
    taxAmount,
    paidAmount,
    paidGrossAmount,
    outstandingAmount,
    outstandingGrossAmount,
    retentionAmount: row.retentionAmount
      ? mapMoney(row.retentionAmount, row.currency)
      : mapMoney('0', row.currency),
    retentionHeldRemaining: retentionHeldRemaining ?? mapMoney('0', row.currency),
    collectionStatus,
  };
}

/** One billing-records + payments fetch; derives position rows and UI summaries. */
export async function loadProjectBillingRecordsBundle(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  timezone: string,
  contractId?: string | null,
): Promise<{ billingRows: ProjectBillingRows; records: BillingRecordSummary[] }> {
  const today = todayInTimeZone(timezone);

  const rows = await db
    .select({
      id: billingRecords.id,
      projectId: billingRecords.projectId,
      projectName: projects.name,
      clientId: billingRecords.clientId,
      projectClientId: projects.clientId,
      contractId: billingRecords.contractId,
      contractName: contracts.name,
      contractNumber: contracts.contractNumber,
      reference: billingRecords.reference,
      issueDate: billingRecords.issueDate,
      dueDate: billingRecords.dueDate,
      status: billingRecords.status,
      kind: billingRecords.kind,
      totalAmount: billingRecords.totalAmount,
      subtotalAmount: billingRecords.subtotalAmount,
      taxAmount: billingRecords.taxAmount,
      currency: billingRecords.currency,
      retentionAmount: billingRecords.retentionAmount,
      retentionHeldRemaining: billingRecords.retentionHeldRemaining,
    })
    .from(billingRecords)
    .leftJoin(projects, eq(projects.id, billingRecords.projectId))
    .leftJoin(contracts, eq(contracts.id, billingRecords.contractId))
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        eq(billingRecords.projectId, projectId),
        isNull(billingRecords.archivedAt),
        contractId ? eq(billingRecords.contractId, contractId) : undefined,
      ),
    )
    .orderBy(desc(billingRecords.issueDate), desc(billingRecords.createdAt))
    .limit(50);

  if (rows.length === 0) {
    return { billingRows: { records: [], currency: '' }, records: [] };
  }

  const currency = rows[0]!.currency;
  const ids = rows.map((row) => row.id);
  const paymentRows = await listPaidAmountRowsByBillingRecordIds(db, organizationId, ids);

  const paymentsByRecord = new Map<string, PaymentAmountInput[]>();
  for (const payment of paymentRows) {
    const amount = fromNumericString(payment.amount, payment.currency);
    if (!amount) continue;
    const list = paymentsByRecord.get(payment.billingRecordId) ?? [];
    list.push({
      amount,
      amountBasis: payment.amountBasis,
      status: payment.status,
    });
    paymentsByRecord.set(payment.billingRecordId, list);
  }

  const billingRows: ProjectBillingRows = {
    currency,
    records: rows.map((record) => ({
      id: record.id,
      dueDate: record.dueDate ? businessDate(record.dueDate) : null,
      kind: record.kind,
      status: record.status,
      totalAmount: mapMoney(record.totalAmount, record.currency),
      subtotalAmount: mapMoney(record.subtotalAmount, record.currency),
      taxAmount: record.taxAmount ? mapMoney(record.taxAmount, record.currency) : null,
      payments: paymentsByRecord.get(record.id) ?? [],
      retentionHeldRemaining: record.retentionHeldRemaining
        ? mapMoney(record.retentionHeldRemaining, record.currency)
        : undefined,
    })),
  };

  const records = rows.map((row) =>
    buildRecordSummary(
      {
        ...row,
        clientId: row.clientId ?? row.projectClientId,
        contractName: row.contractName ?? row.contractNumber,
      },
      paymentsByRecord.get(row.id) ?? [],
      today,
    ),
  );

  return { billingRows, records };
}
