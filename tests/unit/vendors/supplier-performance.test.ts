import { describe, expect, it } from 'vitest';
import {
  averageAvailableScores,
  billAccuracyScore,
  buildSupplierPerformance,
  complianceValidityScore,
  warrantyQualityScore,
} from '@/modules/vendors/domain/supplier-performance';
import { money } from '@/shared/money';

describe('supplier performance formula', () => {
  it('omits missing components and does not treat them as zero', () => {
    const performance = buildSupplierPerformance({
      vendorId: 'v1',
      currency: 'ILS',
      totalPurchased: money('1000', 'ILS'),
      openLiabilities: money('200', 'ILS'),
      projectCount: 2,
      poCount: null,
      poCommitted: null,
      fulfillmentLag: null,
      billDiscrepancy: null,
      warrantyQuality: null,
      subcontract: null,
      compliance: null,
      payment: null,
    });

    expect(performance.scoreComponents).toEqual([]);
    expect(performance.overallScore).toBeNull();
    expect(performance.punchLinked).toBe(false);
    expect(performance.formula).toMatch(/Missing components are omitted/i);
  });

  it('averages only available scored components', () => {
    const bill = billAccuracyScore({ matchedBillCount: 4, discrepancyCount: 1 });
    const warranty = warrantyQualityScore({ coverageCount: 2, openIssueCount: 0 });
    const compliance = complianceValidityScore(null);

    expect(bill?.score).toBe(75);
    expect(warranty?.score).toBe(100);
    expect(compliance).toBeNull();
    expect(averageAvailableScores([bill!, warranty!])).toBe(87.5);
  });

  it('keeps fulfillment lag informational and not scored', () => {
    const performance = buildSupplierPerformance({
      vendorId: 'v1',
      currency: 'ILS',
      totalPurchased: null,
      openLiabilities: null,
      projectCount: null,
      poCount: 3,
      poCommitted: money('500', 'ILS'),
      fulfillmentLag: { sampleSize: 2, averageDays: 12.5 },
      billDiscrepancy: { matchedBillCount: 2, discrepancyCount: 0 },
      warrantyQuality: null,
      subcontract: null,
      compliance: { artifactCount: 2, validCount: 2, expiredOrRevokedCount: 0 },
      payment: null,
    });

    expect(performance.fulfillmentLag?.averageDays).toBe(12.5);
    expect(performance.scoreComponents.map((row) => row.key).sort()).toEqual([
      'billAccuracy',
      'complianceValidity',
    ]);
    expect(performance.overallScore).toBe(100);
  });
});
