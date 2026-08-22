import { and, desc, eq, isNull } from 'drizzle-orm';
import { billingRecords, contracts, projects } from '@drizzle/schema';
import type { ProjectBillingRows } from '@/modules/financials';
import { businessDate, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { addMoney, fromNumericString, type MoneyValue, zeroMoney } from '@/shared/money';
import {
  deriveCollectionStatus,
  recordOutstanding,
  type PaymentAmountInput,
} from '../domain/outstanding';
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
    currency: string;
    retentionAmount?: string;
    retentionHeldRemaining?: string;
  },
  paidAmount: MoneyValue,
  today: BusinessDate,
): BillingRecordSummary {
  const totalAmount = mapMoney(row.totalAmount, row.currency);
  const retentionHeldRemaining = row.retentionHeldRemaining
    ? mapMoney(row.retentionHeldRemaining, row.currency)
    : undefined;
  const outstandingAmount = recordOutstanding(
    totalAmount,
    paidAmount,
    row.kind,
    row.status,
    retentionHeldRemaining,
  );
  const collectionStatus = deriveCollectionStatus(
    outstandingAmount,
    paidAmount,
    row.dueDate as BusinessDate | null,
    today,
    row.status,
  );

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
    paidAmount,
    outstandingAmount,
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
  const paidByRecord = new Map<string, MoneyValue>();
  for (const row of rows) {
    paidByRecord.set(row.id, zeroMoney(row.currency));
  }

  for (const payment of paymentRows) {
    const amount = fromNumericString(payment.amount, payment.currency);
    if (!amount) continue;
    const list = paymentsByRecord.get(payment.billingRecordId) ?? [];
    list.push({ amount, status: payment.status });
    paymentsByRecord.set(payment.billingRecordId, list);
    if (payment.status === 'recorded') {
      const current = paidByRecord.get(payment.billingRecordId);
      if (current) {
        paidByRecord.set(payment.billingRecordId, addMoney(current, amount));
      }
    }
  }

  const billingRows: ProjectBillingRows = {
    currency,
    records: rows.map((record) => ({
      id: record.id,
      dueDate: record.dueDate ? businessDate(record.dueDate) : null,
      kind: record.kind,
      status: record.status,
      totalAmount: mapMoney(record.totalAmount, record.currency),
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
      paidByRecord.get(row.id) ?? zeroMoney(row.currency),
      today,
    ),
  );

  return { billingRows, records };
}
