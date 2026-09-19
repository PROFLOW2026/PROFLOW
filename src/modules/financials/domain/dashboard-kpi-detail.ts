import type { MoneyValue } from '@/shared/money';

export interface DashboardKpiDetailLine {
  readonly label: string;
  readonly money?: MoneyValue | null;
  readonly text?: string | null;
}

/** Serializable detail payload for dashboard KPI «פירוט» modals. */
export interface DashboardKpiDetailContent {
  readonly title: string;
  readonly value?: MoneyValue | null;
  readonly valuePercent?: string | null;
  readonly whatIs: string;
  readonly formula: string;
  readonly breakdown: readonly DashboardKpiDetailLine[];
  readonly fullScreenHref?: string;
  readonly fullScreenLabel?: string;
}
