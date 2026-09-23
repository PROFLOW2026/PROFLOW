import type { BusinessDate } from '@/shared/dates';
import type { ExpensePaymentStatus } from '@/modules/tenancy/domain/org-financial-policies';
import type { MoneyValue } from '@/shared/money';

/** Canonical payment / recognition detail for one cost source on a project breakdown. */
export interface ProjectSourcePaymentDetail {
  readonly sourceKind: 'expense' | 'ap_bill';
  readonly sourceId: string;
  readonly vendorName: string | null;
  readonly categoryKey: string | null;
  readonly expenseDate: BusinessDate | null;
  readonly dueDate: BusinessDate | null;
  /** NET recognized on this project (allocation slice or direct). */
  readonly recognizedNetOnProject: MoneyValue;
  /** Full source NET (expense or bill). */
  readonly sourceNetTotal: MoneyValue;
  /** Full source GROSS payable. */
  readonly sourceGrossTotal: MoneyValue;
  readonly paidGross: MoneyValue;
  readonly remainingGross: MoneyValue;
  readonly paymentStatus: ExpensePaymentStatus | 'partial' | 'unpaid' | null;
  /** When expense is split across projects. */
  readonly projectSharePercent: string | null;
  readonly touchesMultipleProjects: boolean;
  readonly projectTouchCount: number;
}

export interface ProjectCostPaymentSummary {
  readonly currency: string;
  /** Canonical recognized direct/full actual from financials compose. */
  readonly recognizedNet: MoneyValue;
  /**
   * Sum of paid GROSS at source level for distinct expenses touching this project.
   * Each multi-project expense counted once at full paid — not split per project.
   */
  readonly sourcePaidGross: MoneyValue;
  /**
   * Sum of remaining GROSS at source level for distinct expenses touching this project.
   * Full source remaining per expense — not split into fake per-project payables.
   */
  readonly sourceRemainingGross: MoneyValue;
  /** Open AP cash obligation for this project (from compose). */
  readonly apOutstandingGross: MoneyValue | null;
  readonly multiProjectSourceCount: number;
  readonly expenseSourceCount: number;
}
