import { describe, expect, it } from 'vitest';
import {
  fallbackWhere,
  monthCloseIncompleteCopy,
  overdueArCopy,
  vendorBillDueCopy,
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
    expect(fallbackWhere('he-IL', 'vendorBills')).toBe('חשבונות ספק');
    expect(fallbackWhere('en', 'vendorBills')).toBe('Vendor bills');
  });

  it('keeps vendor bill due copy role-neutral', () => {
    const he = vendorBillDueCopy('he-IL', {
      reference: null,
      dueDate: '2026-08-02',
      outstanding: '500',
      currency: 'ILS',
    });
    expect(he.what).toBe('תשלום חשבון ספק באיחור');
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
});
