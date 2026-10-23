import type { MoneyValue } from '@/shared/money';

export interface DashboardKpiDetailLine {
  readonly label: string;
  /** Filtered list of the records in this line. */
  readonly href?: string;
  readonly money?: MoneyValue | null;
  readonly vat?: MoneyValue | null;
  readonly gross?: MoneyValue | null;
  readonly vatLabel?: string | null;
  readonly grossLabel?: string | null;
  readonly noVatLabel?: string | null;
  readonly text?: string | null;
}

/** Serializable detail payload for dashboard KPI «פירוט» modals. */
export interface DashboardKpiDetailContent {
  readonly title: string;
  readonly value?: MoneyValue | null;
  readonly valuePercent?: string | null;
  readonly whatIs: string;
  readonly formula: string;
  readonly grossValue?: MoneyValue | null;
  readonly grossLabel?: string | null;
  readonly breakdown: readonly DashboardKpiDetailLine[];
  readonly fullScreenHref?: string;
  readonly fullScreenLabel?: string;
}

/** Card-face notes move into the detail dialog. Exact text already there is not repeated. */
export function mergeDashboardDetailNotes(
  detail: DashboardKpiDetailContent | undefined,
  title: string,
  notes: readonly (string | null | undefined)[],
): DashboardKpiDetailContent | undefined {
  const fresh = notes
    .map((note) => note?.trim() ?? '')
    .filter((note) => note.length > 0)
    .filter((note, index, all) => all.indexOf(note) === index)
    .filter((note) => !detail || (!detail.whatIs.includes(note) && !detail.formula.includes(note)));
  if (!detail) {
    if (fresh.length === 0) return undefined;
    return { title, whatIs: fresh.join('\n\n'), formula: '', breakdown: [] };
  }
  if (fresh.length === 0) return detail;
  return {
    ...detail,
    whatIs: [detail.whatIs, ...fresh].filter((part) => part.trim().length > 0).join('\n\n'),
  };
}
