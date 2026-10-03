import type { DbExecutor } from '@/shared/db/types';
import { addMoney, money, subtractMoney, sumMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import { outstandingDeductions } from '../domain/deductions';
import { evaluatePaymentEligibility, type PaymentEligibility } from '../domain/eligibility';
import {
  computePayableBasis,
  resolveRetentionCap,
  retentionPosition,
  type PayableBasis,
  type RetentionPosition,
} from '../domain/payable-basis';
import type { PayableBasisView } from '../domain/types';
import {
  listAgreementDeductionFacts,
  listBasesForAgreement,
  listOpenHolds,
  type PayableBasisRow,
} from '../data/financial.repository';
import { loadPaymentFacts, type PaymentFact } from '../data/contract-basis.repository';
import { withPortAccess, type AgreementContext } from './claim-engine';
import { compliancePort } from './ports';
import { toBasisView } from './views';

function sumField(rows: readonly PayableBasisRow[], pick: (row: PayableBasisRow) => string, currency: string): MoneyValue {
  return sumMoney(
    rows.map((row) => money(pick(row), currency)),
    currency,
  );
}

/**
 * Next payable basis for a claim whose effective certified total is `certifiedTotal`. Reads the agreement's
 * earlier bases (retention held, advance recovered, deductions applied) and the deduction ledger.
 */
export async function computeNextBasis(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly agreementId: string;
    readonly claimId: string;
    readonly agreement: AgreementContext;
    readonly certifiedTotal: MoneyValue;
  },
): Promise<{ basis: PayableBasis; version: number }> {
  const currency = input.certifiedTotal.currency;
  const [bases, deductionFacts] = await Promise.all([
    listBasesForAgreement(db, input.organizationId, input.agreementId),
    listAgreementDeductionFacts(db, input.organizationId, input.agreementId),
  ]);
  const claimBases = bases.filter((row) => row.claimId === input.claimId);
  const previous = claimBases.at(-1);
  const terms = input.agreement.terms;

  const basis = computePayableBasis({
    currency,
    certifiedTotal: input.certifiedTotal,
    previousCertifiedTotal: previous ? money(previous.certifiedTotal, currency) : zeroMoney(currency),
    retentionPercent: terms.retentionPercent,
    retentionCap: resolveRetentionCap({
      currency,
      capAmount: terms.retentionCapAmount,
      capPercent: terms.retentionCapPercent,
      contractValue: input.agreement.contractValue,
    }),
    retentionHeldBefore: sumField(bases, (row) => row.retentionAmount, currency),
    advance: {
      method: terms.advanceRecoveryMethod,
      percent: terms.advanceRecoveryPercent,
      pool: subtractMoney(money(terms.advancesPaid, currency), money(terms.advancesRefunded, currency)),
      recoveredBefore: sumField(bases, (row) => row.advanceRecoveryAmount, currency),
      contractValue: input.agreement.contractValue,
    },
    deductionsOutstanding: outstandingDeductions(
      deductionFacts.filter((row) => row.currency === currency),
      sumField(bases, (row) => row.deductionsAmount, currency),
      currency,
    ),
  });
  return { basis, version: (previous?.version ?? 0) + 1 };
}

export interface AgreementPaymentStatus {
  readonly agreementId: string;
  readonly currency: string;
  readonly bases: readonly (PayableBasisView & { readonly claimId: string; readonly bill: PaymentFact | null })[];
  readonly totals: {
    readonly certified: string;
    readonly payableNet: string;
    readonly paid: string;
    readonly advanceRecovered: string;
    readonly deductionsApplied: string;
  };
  readonly retention: {
    readonly percent: string | null;
    readonly cap: string | null;
    readonly held: string;
    readonly released: string;
    readonly remaining: string;
  };
  readonly eligibility: PaymentEligibility;
}

function retentionView(position: RetentionPosition) {
  return {
    percent: position.percent,
    cap: position.cap?.amount ?? null,
    held: position.held.amount,
    released: position.released.amount,
    remaining: position.remaining.amount,
  };
}

/**
 * Payment picture of one agreement: payable bases, AP bill / payment facts (authorized definer port),
 * retention position and eligibility holds. `contractorView` hides internal-only holds and hold notes.
 */
export async function loadAgreementPaymentStatus(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly agreementId: string;
    readonly agreement: AgreementContext;
    readonly contractorView: boolean;
  },
): Promise<AgreementPaymentStatus> {
  const currency = input.agreement.terms.currency;
  const bases = await listBasesForAgreement(db, input.organizationId, input.agreementId);
  const facts = await withPortAccess(() => loadPaymentFacts(db, input.organizationId, input.agreementId));
  const holds = await listOpenHolds(db, input.organizationId, input.agreementId);
  const compliance = await compliancePort().load(db, input.organizationId, input.agreementId);
  const factByBill = new Map(facts.map((fact) => [fact.apBillId, fact]));
  const sameCurrency = bases.filter((row) => row.currency === currency);
  const visibleHolds = input.contractorView ? holds.filter((hold) => hold.contractorVisible) : holds;

  const retentionHeld = sumField(sameCurrency, (row) => row.retentionAmount, currency);
  const released = sumMoney(
    facts
      .filter((fact) => fact.currency === currency)
      .map((fact) => subtractMoney(money(fact.retentionAmount, currency), money(fact.retentionHeldRemaining, currency))),
    currency,
  );
  const terms = input.agreement.terms;
  const eligibility = evaluatePaymentEligibility({
    manualHolds: visibleHolds.map((hold) => ({
      id: hold.id,
      kind: hold.holdKind,
      claimId: hold.claimId,
      note: input.contractorView ? null : hold.note,
      createdAt: hold.createdAt,
    })),
    compliance,
    bases: bases.map((row) => ({
      claimId: row.claimId,
      payableNet: row.payableNet,
      apBillStatus: row.apBillStatus,
      billStatus: row.apBillId ? (factByBill.get(row.apBillId)?.billStatus ?? null) : null,
    })),
  });

  return {
    agreementId: input.agreementId,
    currency,
    bases: bases.map((row) => ({
      ...toBasisView(row),
      claimId: row.claimId,
      bill: row.apBillId ? (factByBill.get(row.apBillId) ?? null) : null,
    })),
    totals: {
      certified: sumField(sameCurrency, (row) => row.certifiedDelta, currency).amount,
      payableNet: sumField(sameCurrency, (row) => row.payableNet, currency).amount,
      paid: sumMoney(
        facts.filter((fact) => fact.currency === currency).map((fact) => money(fact.paidAmount, currency)),
        currency,
      ).amount,
      advanceRecovered: sumField(sameCurrency, (row) => row.advanceRecoveryAmount, currency).amount,
      deductionsApplied: sumField(sameCurrency, (row) => row.deductionsAmount, currency).amount,
    },
    retention: retentionView(
      retentionPosition({
        percent: terms.retentionPercent,
        cap: resolveRetentionCap({
          currency,
          capAmount: terms.retentionCapAmount,
          capPercent: terms.retentionCapPercent,
          contractValue: input.agreement.contractValue,
        }),
        held: retentionHeld,
        released: addMoney(released, zeroMoney(currency)),
      }),
    ),
    eligibility,
  };
}
