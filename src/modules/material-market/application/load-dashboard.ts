import 'server-only';
import type { DbExecutor } from '@/shared/db/types';
import { MATERIAL_TRADES, type MaterialTrade, type TradeSnapshotRow } from '../domain/types';
import { loadLatestSnapshotsForTrades } from '../data/repositories';

export interface DashboardTradeEntry {
  readonly trade: MaterialTrade;
  readonly snapshot: TradeSnapshotRow | null;
}

export async function loadMaterialMarketDashboard(
  db: DbExecutor,
): Promise<DashboardTradeEntry[]> {
  const map = await loadLatestSnapshotsForTrades(db, [...MATERIAL_TRADES]);
  return MATERIAL_TRADES.map((trade) => ({
    trade,
    snapshot: map.get(trade) ?? null,
  }));
}
