import { describe, expect, it } from 'vitest';
import {
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
} from '@/modules/command-center/domain/item-copy';

describe('command center item copy', () => {
  it('uses Hebrew WHAT/WHY for he-IL and keeps English for en', () => {
    const he = overdueArCopy('he-IL', {
      reference: 'INV-9',
      dueDate: '2026-08-01',
      outstanding: '1200',
      currency: 'ILS',
    });
    expect(he.what).toContain('גבייה');
    expect(he.why).toContain('באיחור');

    const en = overdueArCopy('en', {
      reference: 'INV-9',
      dueDate: '2026-08-01',
      outstanding: '1200',
      currency: 'ILS',
    });
    expect(en.what).toBe('Collect INV-9');
    expect(en.why).toContain('Past due since');
  });

  it('localizes fallback location labels', () => {
    expect(fallbackWhere('he-IL', 'vendorBills')).toBe('חשבוניות ספק');
    expect(fallbackWhere('en', 'vendorBills')).toBe('Vendor bills');
  });

  it('keeps vendor bill due copy role-neutral', () => {
    const he = vendorBillDueCopy('he-IL', {
      reference: null,
      dueDate: '2026-08-02',
      outstanding: '500',
      currency: 'ILS',
    });
    expect(he.what).toBe('תשלום חשבונית ספק באיחור');
    expect(he.what.toLowerCase()).not.toContain('owner');
  });

  it('localizes month-close status in WHY', () => {
    const he = monthCloseIncompleteCopy('he-IL', {
      yearMonth: '2026-07',
      status: 'ready',
      completenessPercent: '80',
    });
    expect(he.what).toContain('2026-07');
    expect(he.why).toContain('מוכן לסגירה');
  });

  it('localizes copy for new exception sources', () => {
    const approachingHe = vendorBillApproachingCopy('he-IL', {
      reference: 'VB-1',
      dueDate: '2026-08-20',
      outstanding: '900',
      currency: 'ILS',
    });
    expect(approachingHe.what).toContain('מתקרבת לפירעון');
    expect(vendorBillApproachingCopy('en', {
      reference: 'VB-1',
      dueDate: '2026-08-20',
      outstanding: '900',
      currency: 'ILS',
    }).what).toContain('due soon');

    expect(forecastWarningCopy('he-IL', 'projected_cost_over_budget').what).toContain('תקציב');
    expect(forecastWarningCopy('en', 'collection_risk').what.toLowerCase()).toContain('collection');
    expect(punchOpenCopy('he-IL', 'Ceiling').what).toContain('ליקוי');
    expect(ocrNeedsReviewCopy('en', 'scan.pdf').why).toContain('scan.pdf');
    expect(timesheetMissingCopy('he-IL', '2026-08-07').why).toContain('2026-08-07');
    expect(fallbackWhere('he-IL', 'safety')).toBe('בטיחות');
    expect(fallbackWhere('en', 'ocr')).toBe('Invoice capture');
  });

  it('does not leak BOQ recon status keys into Hebrew Today copy', () => {
    const heCopy = boqVsContractMismatchCopy('he-IL', { status: 'unallocated_approved_change' });
    expect(heCopy.why).toContain('שינוי מאושר לא משויך');
    expect(heCopy.why).not.toMatch(/unallocated_approved_change/);
  });
});
