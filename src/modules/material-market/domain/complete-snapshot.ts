import { MIN_COVERAGE_FOR_DISPLAY } from './methodology';
import type { MaterialTrade, TradeSnapshotRow } from './types';
import { momentumLabel, scoreDirection } from './pressure-engine';

/** A month is publishable when methodology coverage meets the display threshold. */
export function isCompleteSnapshot(row: TradeSnapshotRow): boolean {
  return row.weightedDataCoverage >= MIN_COVERAGE_FOR_DISPLAY;
}

export function filterCompleteSnapshots(rows: TradeSnapshotRow[]): TradeSnapshotRow[] {
  return rows.filter(isCompleteSnapshot);
}

/**
 * Recompute 1m/3m deltas and momentum using only complete months per trade,
 * so partial current-month mixes never affect published momentum.
 */
export function finalizeCompleteSnapshots(rows: TradeSnapshotRow[]): TradeSnapshotRow[] {
  const complete = filterCompleteSnapshots(rows);
  const byTrade = new Map<MaterialTrade, TradeSnapshotRow[]>();
  for (const row of complete) {
    const list = byTrade.get(row.trade) ?? [];
    list.push(row);
    byTrade.set(row.trade, list);
  }

  const out: TradeSnapshotRow[] = [];
  for (const [, tradeRows] of byTrade) {
    const sorted = [...tradeRows].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
    const scores: number[] = [];
    for (const row of sorted) {
      const score = row.pressureScore;
      const d1 = scores.length >= 1 ? score - scores[scores.length - 1]! : null;
      const d3 = scores.length >= 3 ? score - scores[scores.length - 3]! : null;
      scores.push(score);
      out.push({
        ...row,
        pressureScore1mChange: d1 !== null ? round2(d1) : null,
        pressureScore3mChange: d3 !== null ? round2(d3) : null,
        pressureMomentum: momentumLabel(d1, d3),
        pressureDirection: scoreDirection(score),
      });
    }
  }

  return out.sort((a, b) =>
    a.trade.localeCompare(b.trade) || a.snapshotDate.localeCompare(b.snapshotDate),
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function pickLatestCompleteSnapshot(
  rows: TradeSnapshotRow[],
  trade: MaterialTrade,
): TradeSnapshotRow | null {
  const complete = filterCompleteSnapshots(rows.filter((r) => r.trade === trade));
  return complete.at(-1) ?? null;
}
