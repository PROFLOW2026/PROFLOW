import type { ExternalContext } from '@/shared/external';
import { NotFoundError } from '@/shared/errors';
import { addMoney, isPositiveMoney, money, zeroMoney } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';
import { apBills } from '@drizzle/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { findClaim, listClaimRows } from '../data/claims.repository';
import { loadAgreementPaymentTermsDaysByAgreement } from '../data/agreement-cash-terms.repository';
import { findBasis, listBasesForClaims, type PayableBasisRow } from '../data/financial.repository';
import {
  buildCertifiedReceiptCashLines,
  isoDateFromTimestamp,
  type CertifiedReceiptCashFacts,
  type CertifiedReceiptForecastEntry,
} from '../domain/certified-receipt-cash-flow';

export type { CertifiedReceiptForecastEntry };
import { scopedVendorIds } from './support';
import { EXTERNAL_CAPABILITIES as X } from '@/shared/external';

async function apBillDueDatesById(
  db: DbExecutor,
  organizationId: string,
  billIds: readonly string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (billIds.length === 0) return map;
  const rows = await db
    .select({ id: apBills.id, dueDate: apBills.dueDate })
    .from(apBills)
    .where(and(eq(apBills.organizationId, organizationId), inArray(apBills.id, [...billIds])));
  for (const row of rows) {
    map.set(row.id, row.dueDate ? String(row.dueDate).slice(0, 10) : null);
  }
  return map;
}

function basisToFacts(
  basis: PayableBasisRow,
  claim: {
    readonly id: string;
    readonly claimNumber: number;
    readonly projectId: string;
    readonly agreementId: string;
    readonly agreementTitle: string | null;
    readonly certifiedAt: Date | null;
  },
  paymentTermsDays: number | null,
  apBillDueDate: string | null,
): CertifiedReceiptCashFacts {
  const currency = basis.currency;
  return {
    payableBasisId: basis.id,
    claimId: claim.id,
    claimNumber: claim.claimNumber,
    projectId: claim.projectId,
    agreementId: claim.agreementId,
    agreementTitle: claim.agreementTitle,
    sourceVersion: basis.version,
    payableNet: money(basis.payableNet, currency),
    retentionAmount: money(basis.retentionAmount, currency),
    certificationDate: isoDateFromTimestamp(claim.certifiedAt),
    paymentTermsDays,
    apBillDueDate: apBillDueDate as CertifiedReceiptCashFacts['apBillDueDate'],
    scheduleDueDate: null,
  };
}

async function loadCertifiedReceiptEntries(
  db: DbExecutor,
  organizationId: string,
  filter: { readonly projectId: string; readonly vendorIds?: readonly string[] },
): Promise<CertifiedReceiptForecastEntry[]> {
  const rows = await listClaimRows(db, organizationId, {
    projectId: filter.projectId,
    vendorIds: filter.vendorIds,
    statuses: ['certified'],
    limit: 500,
  });
  if (rows.length === 0) return [];

  const claimIds = rows.map((row) => row.id);
  const agreementIds = [...new Set(rows.map((row) => row.agreementId))];
  const [bases, paymentTermsByAgreement] = await Promise.all([
    listBasesForClaims(db, organizationId, claimIds),
    loadAgreementPaymentTermsDaysByAgreement(db, organizationId, agreementIds),
  ]);
  const billIds = bases.map((row) => row.apBillId).filter((id): id is string => Boolean(id));
  const dueByBill = await apBillDueDatesById(db, organizationId, billIds);
  const claimById = new Map(rows.map((row) => [row.id, row]));

  const entries: CertifiedReceiptForecastEntry[] = [];
  for (const basis of bases) {
    const claim = claimById.get(basis.claimId);
    if (!claim) continue;
    const facts = basisToFacts(
      basis,
      claim,
      paymentTermsByAgreement.get(basis.agreementId) ?? null,
      basis.apBillId ? (dueByBill.get(basis.apBillId) ?? null) : null,
    );
    const lines = buildCertifiedReceiptCashLines(facts);
    if (lines.length === 0) continue;
    entries.push({ facts, lines });
  }
  return entries;
}

/** Guest portal + developer org reads: certified payable bases → expected contractor receipts. */
export async function listContractorCertifiedReceiptForecast(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
): Promise<CertifiedReceiptForecastEntry[]> {
  const vendorIds = scopedVendorIds(context, organizationId, projectId, [X.CLAIM_VIEW, X.PAYMENT_VIEW]);
  if (vendorIds.length === 0) throw new NotFoundError('Project');
  return loadCertifiedReceiptEntries(context.db, organizationId, { projectId, vendorIds });
}

export async function certifiedReceiptFactsForBasis(
  db: DbExecutor,
  organizationId: string,
  basisId: string,
): Promise<CertifiedReceiptForecastEntry | null> {
  const basis = await findBasis(db, organizationId, basisId);
  if (!basis) return null;
  const claim = await findClaim(db, organizationId, basis.claimId);
  if (!claim || claim.status !== 'certified') return null;
  const paymentTerms = await loadAgreementPaymentTermsDaysByAgreement(db, organizationId, [basis.agreementId]);
  const dueByBill = basis.apBillId
    ? await apBillDueDatesById(db, organizationId, [basis.apBillId])
    : new Map<string, string | null>();
  const facts = basisToFacts(
    basis,
    claim,
    paymentTerms.get(basis.agreementId) ?? null,
    basis.apBillId ? (dueByBill.get(basis.apBillId) ?? null) : null,
  );
  const lines = buildCertifiedReceiptCashLines(facts);
  if (lines.length === 0) return null;
  return { facts, lines };
}

export function sumCertifiedPayableNet(entries: readonly CertifiedReceiptForecastEntry[]): string | null {
  if (entries.length === 0) return null;
  const currency = entries[0]!.facts.payableNet.currency;
  let total = zeroMoney(currency);
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.lineKey !== 'payable') continue;
      if (!isPositiveMoney(line.amount)) continue;
      total = addMoney(total, line.amount);
    }
  }
  return isPositiveMoney(total) ? total.amount : null;
}
