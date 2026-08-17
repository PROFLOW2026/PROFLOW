/**
 * Supplier performance from recorded vendor data only.
 *
 * Missing components are omitted from any overall figure (neutral).
 * No mysterious AI score. Punch items have no vendor link - quality stays
 * uncovered unless warranty coverage actually names the vendor.
 */

import { addMoney, compareMoney, isZeroMoney, money, zeroMoney, type MoneyValue } from '@/shared/money';

export const SUPPLIER_SCORE_FORMULA =
  'Overall = average of available component scores (0–100). Missing components are omitted, never treated as zero. Components: bill match accuracy, warranty quality when a coverage names this vendor, compliance validity. Payment share, order-to-receipt days, and subcontract billed/current are shown as facts and are not scored.';

export type SupplierScoreComponentKey = 'billAccuracy' | 'warrantyQuality' | 'complianceValidity';

export interface SupplierScoreComponent {
  readonly key: SupplierScoreComponentKey;
  readonly score: number;
  readonly sampleSize: number;
}

export interface SupplierFulfillmentLag {
  readonly sampleSize: number;
  readonly averageDays: number;
}

export interface SupplierBillDiscrepancy {
  readonly matchedBillCount: number;
  readonly discrepancyCount: number;
}

export interface SupplierWarrantyQuality {
  readonly coverageCount: number;
  readonly openIssueCount: number;
}

export interface SupplierSubcontractSnapshot {
  readonly agreementCount: number;
  readonly currentValue: MoneyValue;
  readonly billed: MoneyValue;
  readonly outstanding: MoneyValue;
}

export interface SupplierComplianceSnapshot {
  readonly artifactCount: number;
  readonly validCount: number;
  readonly expiredOrRevokedCount: number;
}

export interface SupplierPaymentRelationship {
  readonly billed: MoneyValue;
  readonly paid: MoneyValue;
  readonly outstanding: MoneyValue;
  readonly paymentCount: number;
}

export interface SupplierPerformance {
  readonly vendorId: string;
  readonly currency: string;
  readonly totalPurchased: MoneyValue | null;
  readonly openLiabilities: MoneyValue | null;
  readonly projectCount: number | null;
  readonly poCount: number | null;
  readonly poCommitted: MoneyValue | null;
  readonly fulfillmentLag: SupplierFulfillmentLag | null;
  readonly billDiscrepancy: SupplierBillDiscrepancy | null;
  readonly warrantyQuality: SupplierWarrantyQuality | null;
  readonly punchLinked: false;
  readonly subcontract: SupplierSubcontractSnapshot | null;
  readonly compliance: SupplierComplianceSnapshot | null;
  readonly payment: SupplierPaymentRelationship | null;
  readonly scoreComponents: readonly SupplierScoreComponent[];
  readonly overallScore: number | null;
  readonly formula: string;
}

export function averageAvailableScores(
  components: readonly SupplierScoreComponent[],
): number | null {
  if (components.length === 0) return null;
  const total = components.reduce((sum, component) => sum + component.score, 0);
  return Math.round((total / components.length) * 10) / 10;
}

export function billAccuracyScore(
  discrepancy: SupplierBillDiscrepancy | null,
): SupplierScoreComponent | null {
  if (!discrepancy || discrepancy.matchedBillCount <= 0) return null;
  const accurate = discrepancy.matchedBillCount - discrepancy.discrepancyCount;
  const ratio = Math.max(0, accurate) / discrepancy.matchedBillCount;
  return {
    key: 'billAccuracy',
    score: Math.round(ratio * 1000) / 10,
    sampleSize: discrepancy.matchedBillCount,
  };
}

export function warrantyQualityScore(
  quality: SupplierWarrantyQuality | null,
): SupplierScoreComponent | null {
  if (!quality || quality.coverageCount <= 0) return null;
  const clean = Math.max(0, quality.coverageCount - quality.openIssueCount);
  const ratio = clean / quality.coverageCount;
  return {
    key: 'warrantyQuality',
    score: Math.round(ratio * 1000) / 10,
    sampleSize: quality.coverageCount,
  };
}

export function complianceValidityScore(
  compliance: SupplierComplianceSnapshot | null,
): SupplierScoreComponent | null {
  if (!compliance || compliance.artifactCount <= 0) return null;
  const ratio = compliance.validCount / compliance.artifactCount;
  return {
    key: 'complianceValidity',
    score: Math.round(ratio * 1000) / 10,
    sampleSize: compliance.artifactCount,
  };
}

export function buildSupplierPerformance(input: {
  readonly vendorId: string;
  readonly currency: string;
  readonly totalPurchased: MoneyValue | null;
  readonly openLiabilities: MoneyValue | null;
  readonly projectCount: number | null;
  readonly poCount: number | null;
  readonly poCommitted: MoneyValue | null;
  readonly fulfillmentLag: SupplierFulfillmentLag | null;
  readonly billDiscrepancy: SupplierBillDiscrepancy | null;
  readonly warrantyQuality: SupplierWarrantyQuality | null;
  readonly subcontract: SupplierSubcontractSnapshot | null;
  readonly compliance: SupplierComplianceSnapshot | null;
  readonly payment: SupplierPaymentRelationship | null;
}): SupplierPerformance {
  const scoreComponents = [
    billAccuracyScore(input.billDiscrepancy),
    warrantyQualityScore(input.warrantyQuality),
    complianceValidityScore(input.compliance),
  ].filter((row): row is SupplierScoreComponent => row != null);

  return {
    vendorId: input.vendorId,
    currency: input.currency,
    totalPurchased: input.totalPurchased,
    openLiabilities: input.openLiabilities,
    projectCount: input.projectCount,
    poCount: input.poCount,
    poCommitted: input.poCommitted,
    fulfillmentLag: input.fulfillmentLag,
    billDiscrepancy: input.billDiscrepancy,
    warrantyQuality: input.warrantyQuality,
    punchLinked: false,
    subcontract: input.subcontract,
    compliance: input.compliance,
    payment: input.payment,
    scoreComponents,
    overallScore: averageAvailableScores(scoreComponents),
    formula: SUPPLIER_SCORE_FORMULA,
  };
}

export function sumRecordedAmounts(
  amounts: readonly MoneyValue[],
  currency: string,
): MoneyValue {
  let total = zeroMoney(currency);
  for (const amount of amounts) {
    if (amount.currency.toUpperCase() !== currency.toUpperCase()) continue;
    total = addMoney(total, amount);
  }
  return total;
}

export function moneyOrNull(amount: MoneyValue): MoneyValue | null {
  return isZeroMoney(amount) ? null : amount;
}

export function asMoney(amount: string, currency: string): MoneyValue {
  return money(amount, currency);
}

export function maxMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  return compareMoney(left, right) >= 0 ? left : right;
}
