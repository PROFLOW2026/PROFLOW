import { describe, expect, it, vi } from 'vitest';
import { loadMaterialMarketDashboard } from '@/modules/material-market/application/load-dashboard';
import { MATERIAL_TRADES } from '@/modules/material-market/domain/types';
import * as repositories from '@/modules/material-market/data/repositories';

describe('loadMaterialMarketDashboard', () => {
  it('returns all registered trades even when snapshot is missing', async () => {
    const snapshot = {
      trade: 'electrical' as const,
      snapshotDate: '2026-01-01',
      pressureScore: 55,
      pressureDirection: 'neutral' as const,
      confidence: 'medium' as const,
      pressureScore1mChange: null,
      pressureScore3mChange: null,
      pressureMomentum: 'stable' as const,
      localConfirmation: 'no_local_data' as const,
      weightedDataCoverage: 0.8,
      components: {},
      driversUp: [],
      driversDown: [],
      methodologyVersion: 'V1',
    };

    vi.spyOn(repositories, 'loadLatestSnapshotsForTrades').mockResolvedValue(
      new Map([['electrical', snapshot]]),
    );

    const entries = await loadMaterialMarketDashboard({} as never);

    expect(entries).toHaveLength(MATERIAL_TRADES.length);
    expect(entries.map((entry) => entry.trade)).toEqual([...MATERIAL_TRADES]);
    expect(entries.find((entry) => entry.trade === 'electrical')?.snapshot).toEqual(snapshot);
    expect(entries.find((entry) => entry.trade === 'concrete')?.snapshot).toBeNull();

    vi.restoreAllMocks();
  });
});
