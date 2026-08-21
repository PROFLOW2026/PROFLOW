import { and, desc, eq, inArray, isNull, notInArray, or } from 'drizzle-orm';
import {
  billingLines,
  billingRecords,
  changeOrders,
  contracts,
  projects,
} from '@drizzle/schema';
import { todayInTimeZone, type BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { addMoney, fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import {
  deriveCollectionStatus,
  recordOutstanding,
  signedBillingAmount,
  sumPaidAmountsForRecord,
} from '../domain/outstanding';
import type {
  BillingKind,
  BillingLineRecord,
  BillingListFilters,
  BillingRecordDetail,
  BillingRecordStatus,
  BillingRecordSummary,
  BillingContractOption,
  PaymentRecordStatus,
  PaymentSummary,
  ProjectOption,
  TaxSnapshot,
  UnbilledChangeOrder,
} from '../domain/types';
import { listPaidAmountRowsByBillingRecordIds, listPaymentRowsForBillingRecord } from './payments.repository';

function mapMoney(amount: string, currency: string): MoneyValue {
  return fromNumericString(amount, currency)!;
}

function mapTaxSnapshot(value: unknown): TaxSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as TaxSnapshot;
  if (
    typeof snapshot.subtotalAmount !== 'string' ||
    typeof snapshot.totalAmount !== 'string' ||
    typeof snapshot.currency !== 'string'
  ) {
    return null;
  }
  return snapshot;
}

export interface BillingRecordInsertRow {
  readonly projectId: string;
  readonly clientId: string | null;
  readonly contractId?: string | null;
  readonly sourceKind?: string;
  readonly sourceId?: string | null;
  readonly kind: BillingKind;
  readonly reference: string | null;
  readonly issueDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly paymentTermId?: string | null;
  readonly subtotalAmount: string;
  readonly taxAmount: string | null;
  readonly totalAmount: string;
  readonly currency: string;
  readonly retentionAmount?: string;
  readonly retentionHeldRemaining?: string;
  readonly externalDocumentId: string | null;
  readonly notes: string | null;
  readonly voidsBillingRecordId: string | null;
  readonly createdByUserId: string | null;
}

export interface BillingLineInsertRow {
  readonly description: string;
  readonly lineTotal: string;
  readonly currency: string;
  readonly changeOrderId: string | null;
  readonly sortOrder: number;
}

export interface BillingRecordUpdateRow {
  readonly projectId?: string;
  readonly clientId?: string | null;
  readonly reference?: string | null;
  readonly issueDate?: BusinessDate;
  readonly dueDate?: BusinessDate | null;
  readonly subtotalAmount?: string;
  readonly taxAmount?: string | null;
  readonly totalAmount?: string;
  readonly currency?: string;
  readonly retentionAmount?: string;
  readonly retentionHeldRemaining?: string;
  readonly externalDocumentId?: string | null;
  readonly notes?: string | null;
  readonly status?: BillingRecordStatus;
  readonly taxSnapshot?: TaxSnapshot | null;
  readonly finalizedAt?: Date | null;
  readonly voidedAt?: Date | null;
}

function mapPayment(row: {
  id: string;
  amount: string;
  currency: string;
  paymentDate: string;
  method: string | null;
  reference: string | null;
  status: PaymentRecordStatus;
  notes: string | null;
}): PaymentSummary {
  return {
    id: row.id,
    amount: mapMoney(row.amount, row.currency),
    paymentDate: row.paymentDate as BusinessDate,
    method: row.method,
    reference: row.reference,
    status: row.status,
    notes: row.notes,
  };
}

function buildSummary(
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

export async function findProjectInOrganization(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectOption | null> {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      currency: projects.currency,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.id, projectId),
        isNull(projects.archivedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listProjectOptions(
  db: DbExecutor,
  organizationId: string,
): Promise<ProjectOption[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      currency: projects.currency,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .orderBy(projects.name);
}

export async function listBillingContractOptions(
  db: DbExecutor,
  organizationId: string,
  projectId?: string,
): Promise<BillingContractOption[]> {
  return db
    .select({
      id: contracts.id,
      projectId: contracts.projectId,
      name: contracts.name,
      contractNumber: contracts.contractNumber,
      isPrimary: contracts.isPrimary,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        isNull(contracts.archivedAt),
        projectId ? eq(contracts.projectId, projectId) : undefined,
      ),
    )
    .orderBy(desc(contracts.isPrimary), contracts.createdAt);
}

export async function insertBillingRecord(
  db: DbExecutor,
  organizationId: string,
  row: BillingRecordInsertRow,
): Promise<string> {
  const [inserted] = await db
    .insert(billingRecords)
    .values({
      organizationId,
      status: 'draft',
      taxSnapshot: null,
      finalizedAt: null,
      voidedAt: null,
      ...row,
    })
    .returning({ id: billingRecords.id });

  return inserted!.id;
}

export async function replaceBillingLines(
  db: DbExecutor,
  organizationId: string,
  billingRecordId: string,
  lines: readonly BillingLineInsertRow[],
): Promise<void> {
  await db
    .delete(billingLines)
    .where(
      and(
        eq(billingLines.organizationId, organizationId),
        eq(billingLines.billingRecordId, billingRecordId),
      ),
    );

  if (lines.length === 0) return;

  await db.insert(billingLines).values(
    lines.map((line) => ({
      organizationId,
      billingRecordId,
      description: line.description,
      lineTotal: line.lineTotal,
      currency: line.currency,
      changeOrderId: line.changeOrderId,
      sortOrder: line.sortOrder,
      taxSnapshot: null,
    })),
  );
}

export async function updateBillingRecordRow(
  db: DbExecutor,
  organizationId: string,
  billingRecordId: string,
  patch: BillingRecordUpdateRow,
): Promise<void> {
  await db
    .update(billingRecords)
    .set(patch)
    .where(
      and(eq(billingRecords.organizationId, organizationId), eq(billingRecords.id, billingRecordId)),
    );
}

export async function findBillingRecordById(
  db: DbExecutor,
  organizationId: string,
  billingRecordId: string,
  timezone: string,
): Promise<BillingRecordDetail | null> {
  const today = todayInTimeZone(timezone);

  const [row] = await db
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
      subtotalAmount: billingRecords.subtotalAmount,
      taxAmount: billingRecords.taxAmount,
      totalAmount: billingRecords.totalAmount,
      currency: billingRecords.currency,
      retentionAmount: billingRecords.retentionAmount,
      retentionHeldRemaining: billingRecords.retentionHeldRemaining,
      taxSnapshot: billingRecords.taxSnapshot,
      finalizedAt: billingRecords.finalizedAt,
      voidedAt: billingRecords.voidedAt,
      voidsBillingRecordId: billingRecords.voidsBillingRecordId,
      externalDocumentId: billingRecords.externalDocumentId,
      notes: billingRecords.notes,
    })
    .from(billingRecords)
    .leftJoin(projects, eq(projects.id, billingRecords.projectId))
    .leftJoin(contracts, eq(contracts.id, billingRecords.contractId))
    .where(
      and(eq(billingRecords.organizationId, organizationId), eq(billingRecords.id, billingRecordId)),
    )
    .limit(1);

  if (!row) return null;

  const paymentRows = await listPaymentRowsForBillingRecord(
    db,
    organizationId,
    billingRecordId,
  );

  const lineRows = await db
    .select({
      id: billingLines.id,
      description: billingLines.description,
      lineTotal: billingLines.lineTotal,
      currency: billingLines.currency,
      changeOrderId: billingLines.changeOrderId,
      sortOrder: billingLines.sortOrder,
    })
    .from(billingLines)
    .where(
      and(
        eq(billingLines.organizationId, organizationId),
        eq(billingLines.billingRecordId, billingRecordId),
      ),
    )
    .orderBy(billingLines.sortOrder);

  const paidAmount = sumPaidAmountsForRecord(
    row.status,
    paymentRows.map((payment) => ({
      amount: mapMoney(payment.amount, payment.currency),
      status: payment.status,
    })),
    row.currency,
  );

  const summary = buildSummary(
    {
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      clientId: row.clientId ?? row.projectClientId,
      contractId: row.contractId,
      contractName: row.contractName ?? row.contractNumber,
      reference: row.reference,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      status: row.status,
      kind: row.kind,
      totalAmount: row.totalAmount,
      currency: row.currency,
      retentionAmount: row.retentionAmount,
      retentionHeldRemaining: row.retentionHeldRemaining,
    },
    paidAmount,
    today,
  );

  const lines: BillingLineRecord[] = lineRows.map((line) => ({
    id: line.id,
    description: line.description,
    lineTotal: mapMoney(line.lineTotal, line.currency),
    changeOrderId: line.changeOrderId,
    sortOrder: line.sortOrder,
  }));

  const paymentSummaries = paymentRows.map(mapPayment);

  return {
    ...summary,
    clientId: row.clientId ?? row.projectClientId,
    subtotalAmount: mapMoney(row.subtotalAmount, row.currency),
    taxAmount: row.taxAmount ? mapMoney(row.taxAmount, row.currency) : null,
    taxSnapshot: mapTaxSnapshot(row.taxSnapshot),
    finalizedAt: row.finalizedAt,
    voidedAt: row.voidedAt,
    voidsBillingRecordId: row.voidsBillingRecordId,
    externalDocumentId: row.externalDocumentId,
    notes: row.notes,
    lines,
    payments: paymentSummaries,
  };
}

export async function listBillingRecords(
  db: DbExecutor,
  organizationId: string,
  filters: BillingListFilters,
  timezone: string,
): Promise<BillingRecordSummary[]> {
  const today = todayInTimeZone(timezone);
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

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
        isNull(billingRecords.archivedAt),
        filters.projectId ? eq(billingRecords.projectId, filters.projectId) : undefined,
        filters.contractId ? eq(billingRecords.contractId, filters.contractId) : undefined,
        filters.clientId
          ? or(
              eq(billingRecords.clientId, filters.clientId),
              eq(projects.clientId, filters.clientId),
            )
          : undefined,
      ),
    )
    .orderBy(desc(billingRecords.issueDate), desc(billingRecords.createdAt))
    .limit(limit)
    .offset(offset);

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const paymentRows = await listPaidAmountRowsByBillingRecordIds(db, organizationId, ids);

  const paidByRecord = new Map<string, MoneyValue>();
  for (const row of rows) {
    paidByRecord.set(row.id, zeroMoney(row.currency));
  }

  for (const payment of paymentRows) {
    if (payment.status !== 'recorded') continue;
    const current = paidByRecord.get(payment.billingRecordId);
    if (!current) continue;
    paidByRecord.set(
      payment.billingRecordId,
      addMoney(current, mapMoney(payment.amount, payment.currency)),
    );
  }

  const summaries = rows.map((row) =>
    buildSummary(
      {
        ...row,
        clientId: row.clientId ?? row.projectClientId,
        contractName: row.contractName ?? row.contractNumber,
      },
      paidByRecord.get(row.id) ?? zeroMoney(row.currency),
      today,
    ),
  );

  const filter = filters.filter ?? 'all';
  if (filter === 'all') return summaries;

  return summaries.filter((summary) => {
    if (filter === 'paid') return summary.collectionStatus === 'paid';
    if (filter === 'outstanding') {
      return summary.collectionStatus === 'open' || summary.collectionStatus === 'partial';
    }
    return summary.collectionStatus === 'overdue';
  });
}

export async function listBillingRecordsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  timezone: string,
  contractId?: string | null,
): Promise<BillingRecordSummary[]> {
  return listBillingRecords(
    db,
    organizationId,
    { projectId, filter: 'all', limit: 50, contractId: contractId ?? undefined },
    timezone,
  );
}

export async function listProjectBillingAmountRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<
  {
    kind: BillingKind;
    status: BillingRecordStatus;
    totalAmount: string;
    currency: string;
    payments: { amount: string; currency: string; status: PaymentRecordStatus }[];
  }[]
> {
  const rows = await db
    .select({
      id: billingRecords.id,
      kind: billingRecords.kind,
      status: billingRecords.status,
      totalAmount: billingRecords.totalAmount,
      currency: billingRecords.currency,
    })
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        eq(billingRecords.projectId, projectId),
        isNull(billingRecords.archivedAt),
      ),
    );

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const paymentRows = await listPaidAmountRowsByBillingRecordIds(db, organizationId, ids);

  const paymentsByRecord = new Map<string, typeof paymentRows>();
  for (const payment of paymentRows) {
    const list = paymentsByRecord.get(payment.billingRecordId) ?? [];
    list.push(payment);
    paymentsByRecord.set(payment.billingRecordId, list);
  }

  return rows.map((row) => ({
    kind: row.kind,
    status: row.status,
    totalAmount: row.totalAmount,
    currency: row.currency,
    payments: (paymentsByRecord.get(row.id) ?? []).map((payment) => ({
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
    })),
  }));
}

export async function listUnbilledChangeOrders(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<UnbilledChangeOrder[]> {
  const billedRows = await db
    .select({ changeOrderId: billingLines.changeOrderId })
    .from(billingLines)
    .innerJoin(billingRecords, eq(billingRecords.id, billingLines.billingRecordId))
    .where(
      and(
        eq(billingLines.organizationId, organizationId),
        eq(billingRecords.projectId, projectId),
        eq(billingRecords.status, 'finalized'),
      ),
    );

  const billedIds = billedRows
    .map((row) => row.changeOrderId)
    .filter((id): id is string => id !== null);

  const rows = await db
    .select({
      id: changeOrders.id,
      reference: changeOrders.reference,
      direction: changeOrders.direction,
      amount: changeOrders.amount,
      currency: changeOrders.currency,
      effectiveDate: changeOrders.effectiveDate,
    })
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.organizationId, organizationId),
        eq(changeOrders.projectId, projectId),
        billedIds.length > 0 ? notInArray(changeOrders.id, billedIds) : undefined,
      ),
    )
    .orderBy(desc(changeOrders.effectiveDate));

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    direction: row.direction,
    amount: mapMoney(row.amount, row.currency),
    effectiveDate: row.effectiveDate as BusinessDate,
  }));
}

export async function findChangeOrdersInProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  changeOrderIds: readonly string[],
): Promise<{ id: string; reference: string | null }[]> {
  if (changeOrderIds.length === 0) return [];

  return db
    .select({ id: changeOrders.id, reference: changeOrders.reference })
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.organizationId, organizationId),
        eq(changeOrders.projectId, projectId),
        inArray(changeOrders.id, [...changeOrderIds]),
      ),
    );
}

export { signedBillingAmount };
