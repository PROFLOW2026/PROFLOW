import type { DbCostFamily } from './cost-aggregation';
import type { BusinessDate } from '@/shared/dates';
import { addMoney, type MoneyValue } from '@/shared/money';

/** One recognized cost unit shared by monthly and project engines (F03). */
export type RecognitionAtomSource =
  | 'expense'
  | 'ap_bill'
  | 'employer_cost'
  | 'emc_estimate';

export interface RecognitionAtom {
  readonly source: RecognitionAtomSource;
  readonly sourceRowId: string;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly currency: string;
  readonly recognitionYearMonth: string;
  readonly recognitionDate: BusinessDate;
  readonly projectId: string | null;
  readonly overhead: boolean;
  readonly costFamily: DbCostFamily | null;
  /** Draft EMC and similar rows — excluded from finalized monthly totals (OD-05). */
  readonly estimate: boolean;
}

/** Sum NET for finalized atoms in one calendar month. */
export function sumRecognitionAtomNetInMonth(
  atoms: readonly RecognitionAtom[],
  yearMonth: string,
): MoneyValue | null {
  const normalized = yearMonth.trim();
  let total: MoneyValue | null = null;
  for (const atom of atoms) {
    if (atom.estimate) continue;
    if (atom.recognitionYearMonth !== normalized) continue;
    total = total ? addMoney(total, atom.net) : atom.net;
  }
  return total;
}
