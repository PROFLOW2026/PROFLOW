import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Read ports backed by the 0159 SECURITY DEFINER functions. Each function re-checks authorization in the
 * database (claim.view / ext.claim.* for contract + terms, payment.view / ext.payment.view for AP facts) and
 * raises 42501 otherwise, so a claim reviewer without contract.financial.view still gets line values for
 * claim math - and nothing beyond the agreement asked for.
 */

function sqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

function decimal(value: unknown): string {
  if (value === null || value === undefined) return '0';
  return typeof value === 'number' ? value.toFixed(6) : String(value);
}

function nullableDecimal(value: unknown): string | null {
  return value === null || value === undefined ? null : decimal(value);
}

export interface ContractBasisLine {
  readonly workLineId: string;
  readonly parentLineId: string | null;
  readonly code: string | null;
  readonly description: string;
  readonly unit: string;
  readonly quantity: string;
  readonly sortOrder: number;
  readonly lineStatus: string;
  readonly locationId: string | null;
  readonly lineType: string;
  readonly isBaseline: boolean;
  readonly contractAmount: string;
  readonly adjustmentAmount: string;
  readonly adjustmentQuantity: string;
}

export async function loadContractBasis(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<ContractBasisLine[]> {
  const rows = sqlRows<Record<string, unknown>>(
    await db.execute(
      sql`select * from app.subcontract_claim_contract_basis(${organizationId}::uuid, ${agreementId}::uuid)`,
    ),
  );
  return rows.map((row) => ({
    workLineId: String(row.work_line_id),
    parentLineId: (row.parent_line_id as string | null) ?? null,
    code: (row.code as string | null) ?? null,
    description: String(row.description),
    unit: String(row.unit),
    quantity: decimal(row.quantity),
    sortOrder: Number(row.sort_order ?? 0),
    lineStatus: String(row.line_status),
    locationId: (row.location_id as string | null) ?? null,
    lineType: String(row.line_type),
    isBaseline: row.is_baseline === true || row.is_baseline === 't',
    contractAmount: decimal(row.contract_amount),
    adjustmentAmount: decimal(row.adjustment_amount),
    adjustmentQuantity: decimal(row.adjustment_quantity),
  }));
}

export interface AgreementTerms {
  readonly projectId: string;
  readonly vendorId: string;
  readonly agreementStatus: string;
  readonly currency: string;
  readonly originalAmount: string;
  readonly originalEventAmount: string | null;
  readonly changeEventsAmount: string;
  readonly retentionPercent: string | null;
  readonly retentionCapPercent: string | null;
  readonly retentionCapAmount: string | null;
  readonly advanceRecoveryMethod: 'none' | 'proportional' | 'fixed_percent_per_claim';
  readonly advanceRecoveryPercent: string | null;
  readonly advancesPaid: string;
  readonly advancesApplied: string;
  readonly advancesRefunded: string;
}

export async function loadAgreementTerms(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<AgreementTerms | null> {
  const [row] = sqlRows<Record<string, unknown>>(
    await db.execute(
      sql`select * from app.subcontract_claim_agreement_terms(${organizationId}::uuid, ${agreementId}::uuid)`,
    ),
  );
  if (!row) return null;
  const method = String(row.advance_recovery_method ?? 'none');
  return {
    projectId: String(row.project_id),
    vendorId: String(row.vendor_id),
    agreementStatus: String(row.agreement_status),
    currency: String(row.currency).toUpperCase(),
    originalAmount: decimal(row.original_amount),
    originalEventAmount: nullableDecimal(row.original_event_amount),
    changeEventsAmount: decimal(row.change_events_amount),
    retentionPercent: nullableDecimal(row.retention_percent),
    retentionCapPercent: nullableDecimal(row.retention_cap_percent),
    retentionCapAmount: nullableDecimal(row.retention_cap_amount),
    advanceRecoveryMethod:
      method === 'proportional' || method === 'fixed_percent_per_claim' ? method : 'none',
    advanceRecoveryPercent: nullableDecimal(row.advance_recovery_percent),
    advancesPaid: decimal(row.advances_paid),
    advancesApplied: decimal(row.advances_applied),
    advancesRefunded: decimal(row.advances_refunded),
  };
}

export interface PaymentFact {
  readonly apBillId: string;
  readonly billStatus: string;
  readonly billDate: string | null;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
  readonly retentionAmount: string;
  readonly retentionHeldRemaining: string;
  readonly paidAmount: string;
  readonly advanceAppliedAmount: string;
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function loadPaymentFacts(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<PaymentFact[]> {
  const rows = sqlRows<Record<string, unknown>>(
    await db.execute(
      sql`select * from app.subcontract_claim_payment_facts(${organizationId}::uuid, ${agreementId}::uuid)`,
    ),
  );
  return rows.map((row) => ({
    apBillId: String(row.ap_bill_id),
    billStatus: String(row.bill_status),
    billDate: isoDate(row.bill_date),
    dueDate: isoDate(row.due_date),
    currency: String(row.currency).toUpperCase(),
    netAmount: decimal(row.net_amount),
    taxAmount: decimal(row.tax_amount),
    grossAmount: decimal(row.gross_amount),
    retentionAmount: decimal(row.retention_amount),
    retentionHeldRemaining: decimal(row.retention_held_remaining),
    paidAmount: decimal(row.paid_amount),
    advanceAppliedAmount: decimal(row.advance_applied_amount),
  }));
}
