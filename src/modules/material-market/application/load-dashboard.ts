import 'server-only';
import type { DbExecutor } from '@/shared/db/types';
import { MATERIAL_TRADES, type TradeSnapshotRow } from '../domain/types';
import { loadLatestSnapshotsForTrades } from '../data/repositories';

export async function loadMaterialMarketDashboard(
  db: DbExecutor,
): Promise<TradeSnapshotRow[]> {
  const map = await loadLatestSnapshotsForTrades(db, [...MATERIAL_TRADES]);
  return MATERIAL_TRADES.map((trade) => map.get(trade)).filter(
    (row): row is TradeSnapshotRow => row != null,
  );
}
