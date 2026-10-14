import type { MonthCashFlow } from '../month-cash-flow';
import type { MoneyValue } from '@/shared/money';
import type { YearBookMonthPeriod } from './periods';

export interface YearBookPaymentRow {
  readonly date: string;
  readonly party: string;
  readonly description: string;
  readonly project: string;
  readonly net: MoneyValue;
  readonly vat: MoneyValue;
  readonly gross: MoneyValue;
  readonly nature: 'actual' | 'expected';
}

export interface YearBookReceiptRow {
  readonly date: string;
  readonly client: string;
  readonly project: string;
  readonly net: MoneyValue;
  readonly vat: MoneyValue;
  readonly gross: MoneyValue;
  readonly nature: 'actual' | 'expected';
}

export interface YearBookRecognizedCostRow {
  readonly date: string;
  readonly party: string;
  readonly description: string;
  readonly project: string;
  readonly net: MoneyValue;
  readonly vat: MoneyValue;
  readonly gross: MoneyValue;
  readonly category: string;
}

export interface YearBookEmployerCostRow {
  readonly yearMonth: string;
  readonly employee: string;
  readonly project: string;
  readonly net: MoneyValue;
  readonly nature: 'final' | 'estimate';
}

export interface YearBookBillingRow {
  readonly issueDate: string;
  readonly client: string;
  readonly project: string;
  readonly reference: string;
  readonly net: MoneyValue;
  readonly vat: MoneyValue;
  readonly gross: MoneyValue;
  readonly status: string;
}

export interface YearBookOverheadSlice {
  readonly label: string;
  readonly net: MoneyValue;
}

export interface YearBookMonthSummary {
  readonly netInvoiced: MoneyValue | null;
  readonly grossCollected: MoneyValue | null;
  readonly recognizedCostNet: MoneyValue | null;
  readonly recognizedCostVat: MoneyValue | null;
  readonly cashPaidGross: MoneyValue | null;
  readonly employerCostNet: MoneyValue | null;
  readonly expectedCommitmentsGross: MoneyValue | null;
  readonly netCashActual: MoneyValue | null;
  readonly operationalProfitNet: MoneyValue | null;
}

export interface YearBookMonthData {
  readonly period: YearBookMonthPeriod;
  readonly payments: readonly YearBookPaymentRow[];
  readonly receipts: readonly YearBookReceiptRow[];
  readonly recognizedCosts: readonly YearBookRecognizedCostRow[];
  readonly employerCosts: readonly YearBookEmployerCostRow[];
  readonly payrollCash: readonly YearBookPaymentRow[];
  readonly overhead: readonly YearBookOverheadSlice[];
  readonly billings: readonly YearBookBillingRow[];
  readonly commitments: readonly YearBookPaymentRow[];
  readonly summary: YearBookMonthSummary;
  readonly cashFlow: MonthCashFlow | null;
}

export interface YearBookOverviewRow {
  readonly monthLabel: string;
  readonly recognizedNet: number | null;
  readonly cashPaidGross: number | null;
  readonly employerNet: number | null;
  readonly netInvoiced: number | null;
  readonly grossCollected: number | null;
  readonly paymentCount: number;
  readonly receiptCount: number;
}

export interface FinancialYearBookData {
  readonly year: number;
  readonly organizationName: string;
  readonly currency: string;
  readonly generatedAt: string;
  readonly canReadBilling: boolean;
  /** Billing/receipt rows omitted because currency ≠ book currency (F08). */
  readonly fxExcludedCount: number;
  readonly billingRecordsTruncated: boolean;
  readonly paymentApplicationsTruncated: boolean;
  readonly months: readonly YearBookMonthData[];
  readonly overview: readonly YearBookOverviewRow[];
}
