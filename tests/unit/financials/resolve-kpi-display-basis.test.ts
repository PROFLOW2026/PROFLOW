import { describe, expect, it } from 'vitest';
import { PROJECT_KPI_AMOUNT_BASIS } from '@/modules/financials/ui/resolve-kpi-display';

describe('PROJECT_KPI_AMOUNT_BASIS (F10)', () => {
  it('marks billing KPIs with distinct net vs gross bases', () => {
    expect(PROJECT_KPI_AMOUNT_BASIS.billed).toBe('net');
    expect(PROJECT_KPI_AMOUNT_BASIS.paid).toBe('gross');
    expect(PROJECT_KPI_AMOUNT_BASIS.outstanding).toBe('gross');
    expect(PROJECT_KPI_AMOUNT_BASIS.billedGross).toBe('gross');
    expect(PROJECT_KPI_AMOUNT_BASIS.billed).not.toBe(PROJECT_KPI_AMOUNT_BASIS.paid);
  });
});
