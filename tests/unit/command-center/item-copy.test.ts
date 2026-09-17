import { describe, expect, it } from 'vitest';
import {
  commandCenterCopyScope,
  fallbackWhere,
  monthCloseIncompleteCopy,
  overdueArCopy,
  vendorBillDueCopy,
  vendorBillApproachingCopy,
  forecastWarningCopy,
  punchOpenCopy,
  ocrNeedsReviewCopy,
  timesheetMissingCopy,
  boqVsContractMismatchCopy,
  billingPlanRetentionReleaseDueCopy,
  cashFlowRiskCopy,
  approvalEntityTypeLabel,
  automationPresetLabel,
  openApprovalCopy,
} from '@/modules/command-center/domain/item-copy';
import { commandCenterCopyTranslator } from '@/shared/i18n/sync-namespace-translator';

function scope(locale: string) {
  const t = commandCenterCopyTranslator(locale);
  return commandCenterCopyScope(t, locale);
}

describe('command center item copy', () => {
  it('uses Hebrew WHAT/WHY for he-IL and keeps English for en', () => {
    const he = overdueArCopy(scope('he-IL'), {
      reference: 'INV-9',
      dueDate: '2026-08-01',
      outstanding: '1200',
      currency: 'ILS',
    });
    expect(he.what).toContain('גבייה');
    expect(he.why).toContain('באיחור');

    const en = overdueArCopy(scope('en'), {
      reference: 'INV-9',
      dueDate: '2026-08-01',
      outstanding: '1200',
      currency: 'ILS',
    });
    expect(en.what).toBe('Collect INV-9');
    expect(en.why).toContain('Past due since');
  });

  it('localizes fallback location labels', () => {
    expect(fallbackWhere(scope('he-IL'), 'vendorBills')).toBe('חשבוניות ספק');
    expect(fallbackWhere(scope('en'), 'vendorBills')).toBe('Vendor bills');
  });

  it('keeps vendor bill due copy role-neutral', () => {
    const he = vendorBillDueCopy(scope('he-IL'), {
      reference: null,
      dueDate: '2026-08-02',
      outstanding: '500',
      currency: 'ILS',
    });
    expect(he.what).toBe('תשלום חשבונית ספק באיחור');
    expect(he.what.toLowerCase()).not.toContain('owner');
  });

  it('localizes month-close status in WHY', () => {
    const he = monthCloseIncompleteCopy(scope('he-IL'), {
      yearMonth: '2026-07',
      status: 'ready',
      completenessPercent: '80',
    });
    expect(he.what).toContain('2026-07');
    expect(he.why).toContain('מוכן לסגירה');
  });

  it('localizes copy for new exception sources', () => {
    const approachingHe = vendorBillApproachingCopy(scope('he-IL'), {
      reference: 'VB-1',
      dueDate: '2026-08-20',
      outstanding: '900',
      currency: 'ILS',
    });
    expect(approachingHe.what).toContain('מתקרבת לפירעון');
    expect(vendorBillApproachingCopy(scope('en'), {
      reference: 'VB-1',
      dueDate: '2026-08-20',
      outstanding: '900',
      currency: 'ILS',
    }).what).toContain('due soon');

    expect(forecastWarningCopy(scope('he-IL'), 'projected_cost_over_budget').what).toContain('תקציב');
    expect(forecastWarningCopy(scope('en'), 'collection_risk').what.toLowerCase()).toContain('collection');
    expect(punchOpenCopy(scope('he-IL'), 'Ceiling').what).toContain('ליקוי');
    expect(ocrNeedsReviewCopy(scope('en'), 'scan.pdf').why).toContain('scan.pdf');
    expect(timesheetMissingCopy(scope('he-IL'), '2026-08-07').why).toContain('2026-08-07');
    expect(fallbackWhere(scope('he-IL'), 'safety')).toBe('בטיחות');
    expect(fallbackWhere(scope('en'), 'ocr')).toBe('Invoice capture');
  });

  it('does not leak BOQ recon status keys into Hebrew Today copy', () => {
    const heCopy = boqVsContractMismatchCopy(scope('he-IL'), { status: 'unallocated_approved_change' });
    expect(heCopy.why).toContain('שינוי מאושר לא משויך');
    expect(heCopy.why).not.toMatch(/unallocated_approved_change/);
  });

  it('localizes billing-plan retention release due copy', () => {
    const he = billingPlanRetentionReleaseDueCopy(scope('he-IL'), {
      heldRemaining: '1500.000000',
      currency: 'ILS',
    });
    expect(he.what).toContain('עיכבון');
    expect(he.why).toContain('1,500.00');
    expect(he.why).not.toContain('1500.000000');

    const en = billingPlanRetentionReleaseDueCopy(scope('en'), {
      heldRemaining: '1500.000000',
      currency: 'ILS',
    });
    expect(en.what.toLowerCase()).toContain('retention');
  });

  it('never exposes raw approval entity codes in open approval copy', () => {
    const copy = openApprovalCopy(scope('he-IL'), {
      entityType: 'purchase_order',
      amount: '1200.000000',
      currency: 'ILS',
    });
    expect(copy.why).toContain('הזמנת רכש');
    expect(copy.why).not.toMatch(/purchase_order/);
    expect(copy.why).toContain('1,200.00');
  });

  it('falls back to generic labels for unknown approval and automation keys', () => {
    const heT = commandCenterCopyTranslator('he-IL');
    expect(approvalEntityTypeLabel(heT, 'unknown_entity')).toBe('בקשה לאישור');
    expect(automationPresetLabel(heT, 'unknown_preset')).toBe('כלל אוטומציה');
    expect(automationPresetLabel(commandCenterCopyTranslator('en'), 'unknown_preset')).toBe('Automation rule');
  });

  it('formats cash-flow risk copy with at most two decimal places', () => {
    const he = cashFlowRiskCopy(scope('he-IL'), {
      overdueIn: '77416.500000',
      overdueOut: '0.000000',
      currency: 'ILS',
    });
    expect(he.what).toBe('סיכון תזרים לטיפול');
    expect(he.why).toContain('77,416.50');
    expect(he.why).toContain('0.00');
    expect(he.why).not.toMatch(/77416\.500000|0\.000000/);
  });
});
