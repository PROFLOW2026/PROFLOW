import 'server-only';
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  materialMarketObservations,
  materialMarketSources,
  materialPressureSnapshots,
  materialVendorPrices,
  materialItems,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { MIN_COVERAGE_FOR_DISPLAY } from '../domain/methodology';
import type { MaterialTrade, MonthlySeries, TradeSnapshotRow } from '../domain/types';
import { METHODOLOGY_VERSION } from '../domain/types';
import type { SourceSeedRow } from '../sources/registry';
import type { SupplierSignals } from '../domain/pressure-engine';

export interface SourceRecord {
  id: string;
  code: string;
  nameHe: string;
  lastObservationDate: string | null;
  lastRefreshAt: Date | null;
  lastError: string | null;
}

export async function upsertSourceSeed(db: DbExecutor, rows: SourceSeedRow[]): Promise<void> {
  for (const row of rows) {
    await db
      .insert(materialMarketSources)
      .values({
        code: row.code,
        nameHe: row.nameHe,
        trade: row.trade,
        sourceType: row.sourceType,
        sourceName: row.sourceName,
        sourceSeriesId: row.sourceSeriesId,
        sourceUrl: row.sourceUrl,
        frequency: row.frequency,
        unit: row.unit,
        currency: row.currency,
        isActive: row.isActive,
        isDerived: row.isDerived,
      })
      .onConflictDoUpdate({
        target: materialMarketSources.code,
        set: {
          nameHe: row.nameHe,
          trade: row.trade,
          sourceType: row.sourceType,
          sourceName: row.sourceName,
          sourceSeriesId: row.sourceSeriesId,
          sourceUrl: row.sourceUrl,
          frequency: row.frequency,
          unit: row.unit,
          currency: row.currency,
          isActive: row.isActive,
          isDerived: row.isDerived,
          updatedAt: new Date(),
        },
      });
  }
}

export async function deactivateSourcesExcept(
  db: DbExecutor,
  activeCodes: readonly string[],
): Promise<void> {
  const rows = await db
    .select({ id: materialMarketSources.id, code: materialMarketSources.code })
    .from(materialMarketSources);
  for (const row of rows) {
    if (!activeCodes.includes(row.code)) {
      await db
        .update(materialMarketSources)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(materialMarketSources.id, row.id));
    }
  }
}

export async function listSourcesByCode(db: DbExecutor): Promise<Map<string, SourceRecord>> {
  const rows = await db
    .select({
      id: materialMarketSources.id,
      code: materialMarketSources.code,
      nameHe: materialMarketSources.nameHe,
      lastObservationDate: materialMarketSources.lastObservationDate,
      lastRefreshAt: materialMarketSources.lastRefreshAt,
      lastError: materialMarketSources.lastError,
    })
    .from(materialMarketSources);
  return new Map(rows.map((r) => [r.code, r]));
}

export async function getLatestObservationDate(
  db: DbExecutor,
  sourceId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ d: materialMarketObservations.observationDate })
    .from(materialMarketObservations)
    .where(eq(materialMarketObservations.sourceId, sourceId))
    .orderBy(desc(materialMarketObservations.observationDate))
    .limit(1);
  return row?.d ?? null;
}

export async function upsertObservations(
  db: DbExecutor,
  sourceId: string,
  series: MonthlySeries,
): Promise<number> {
  let count = 0;
  for (const [ym, value] of Object.entries(series)) {
    const observationDate = `${ym}-01`;
    await db
      .insert(materialMarketObservations)
      .values({ sourceId, observationDate, value })
      .onConflictDoUpdate({
        target: [materialMarketObservations.sourceId, materialMarketObservations.observationDate],
        set: { value },
      });
    count += 1;
  }
  if (count > 0) {
    const latest = Object.keys(series).sort().at(-1)!;
    await db
      .update(materialMarketSources)
      .set({
        lastObservationDate: `${latest}-01`,
        lastRefreshAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(materialMarketSources.id, sourceId));
  }
  return count;
}

export async function markSourceError(
  db: DbExecutor,
  sourceId: string,
  error: string,
): Promise<void> {
  await db
    .update(materialMarketSources)
    .set({ lastError: error.slice(0, 500), updatedAt: new Date() })
    .where(eq(materialMarketSources.id, sourceId));
}

export async function loadSeriesByCodes(
  db: DbExecutor,
  codes: string[],
): Promise<Record<string, MonthlySeries>> {
  const sources = await db
    .select({ id: materialMarketSources.id, code: materialMarketSources.code })
    .from(materialMarketSources)
    .where(inArray(materialMarketSources.code, codes));
  const idToCode = new Map(sources.map((s) => [s.id, s.code]));
  if (sources.length === 0) return {};

  const observations = await db
    .select({
      sourceId: materialMarketObservations.sourceId,
      observationDate: materialMarketObservations.observationDate,
      value: materialMarketObservations.value,
    })
    .from(materialMarketObservations)
    .where(
      inArray(
        materialMarketObservations.sourceId,
        sources.map((s) => s.id),
      ),
    )
    .orderBy(materialMarketObservations.observationDate);

  const out: Record<string, MonthlySeries> = Object.fromEntries(codes.map((c) => [c, {}]));
  for (const obs of observations) {
    const code = idToCode.get(obs.sourceId);
    if (!code) continue;
    const ym = obs.observationDate.slice(0, 7);
    out[code]![ym] = obs.value;
  }
  return out;
}

function rowToSnapshot(row: typeof materialPressureSnapshots.$inferSelect): TradeSnapshotRow {
  return {
    trade: row.trade as MaterialTrade,
    snapshotDate: row.snapshotDate,
    pressureScore: row.pressureScore,
    pressureDirection: row.pressureDirection as TradeSnapshotRow['pressureDirection'],
    confidence: row.confidence as TradeSnapshotRow['confidence'],
    pressureScore1mChange: row.pressureScore1mChange,
    pressureScore3mChange: row.pressureScore3mChange,
    pressureMomentum: row.pressureMomentum as TradeSnapshotRow['pressureMomentum'],
    localConfirmation: row.localConfirmation as TradeSnapshotRow['localConfirmation'],
    weightedDataCoverage: row.weightedDataCoverage,
    components: (row.componentsJson ?? {}) as TradeSnapshotRow['components'],
    driversUp: (row.driversUpJson ?? []) as string[],
    driversDown: (row.driversDownJson ?? []) as string[],
    methodologyVersion: row.methodologyVersion,
  };
}

export async function upsertSnapshots(
  db: DbExecutor,
  snapshots: TradeSnapshotRow[],
): Promise<number> {
  for (const snap of snapshots) {
    await db
      .insert(materialPressureSnapshots)
      .values({
        trade: snap.trade,
        snapshotDate: snap.snapshotDate,
        pressureScore: snap.pressureScore,
        pressureDirection: snap.pressureDirection,
        confidence: snap.confidence,
        pressureScore1mChange: snap.pressureScore1mChange,
        pressureScore3mChange: snap.pressureScore3mChange,
        pressureMomentum: snap.pressureMomentum,
        localConfirmation: snap.localConfirmation,
        weightedDataCoverage: snap.weightedDataCoverage,
        componentsJson: snap.components,
        driversUpJson: snap.driversUp,
        driversDownJson: snap.driversDown,
        methodologyVersion: snap.methodologyVersion,
      })
      .onConflictDoUpdate({
        target: [
          materialPressureSnapshots.trade,
          materialPressureSnapshots.snapshotDate,
          materialPressureSnapshots.methodologyVersion,
        ],
        set: {
          pressureScore: snap.pressureScore,
          pressureDirection: snap.pressureDirection,
          confidence: snap.confidence,
          pressureScore1mChange: snap.pressureScore1mChange,
          pressureScore3mChange: snap.pressureScore3mChange,
          pressureMomentum: snap.pressureMomentum,
          localConfirmation: snap.localConfirmation,
          weightedDataCoverage: snap.weightedDataCoverage,
          componentsJson: snap.components,
          driversUpJson: snap.driversUp,
          driversDownJson: snap.driversDown,
          updatedAt: new Date(),
        },
      });
  }
  return snapshots.length;
}

export async function loadLatestSnapshotsForTrades(
  db: DbExecutor,
  trades: MaterialTrade[],
): Promise<Map<MaterialTrade, TradeSnapshotRow>> {
  const result = new Map<MaterialTrade, TradeSnapshotRow>();
  for (const trade of trades) {
    const rows = await db
      .select()
      .from(materialPressureSnapshots)
      .where(
        and(
          eq(materialPressureSnapshots.trade, trade),
          eq(materialPressureSnapshots.methodologyVersion, METHODOLOGY_VERSION),
          gte(materialPressureSnapshots.weightedDataCoverage, MIN_COVERAGE_FOR_DISPLAY),
        ),
      )
      .orderBy(desc(materialPressureSnapshots.snapshotDate))
      .limit(1);
    const row = rows[0];
    if (row) result.set(trade, rowToSnapshot(row));
  }
  return result;
}

export async function loadSnapshotHistory(
  db: DbExecutor,
  trade: MaterialTrade,
  months: 12 | 24 | 'all',
): Promise<Array<{ date: string; score: number }>> {
  const conditions = [
    eq(materialPressureSnapshots.trade, trade),
    eq(materialPressureSnapshots.methodologyVersion, METHODOLOGY_VERSION),
    gte(materialPressureSnapshots.weightedDataCoverage, MIN_COVERAGE_FOR_DISPLAY),
  ];
  if (months !== 'all') {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    conditions.push(gte(materialPressureSnapshots.snapshotDate, cutoff.toISOString().slice(0, 10)));
  }

  const rows = await db
    .select({
      snapshotDate: materialPressureSnapshots.snapshotDate,
      pressureScore: materialPressureSnapshots.pressureScore,
    })
    .from(materialPressureSnapshots)
    .where(and(...conditions))
    .orderBy(materialPressureSnapshots.snapshotDate);

  return rows.map((r) => ({ date: r.snapshotDate, score: r.pressureScore }));
}

export async function deleteSnapshotsAfterDate(
  db: DbExecutor,
  afterDate: string,
): Promise<void> {
  await db
    .delete(materialPressureSnapshots)
    .where(
      and(
        eq(materialPressureSnapshots.methodologyVersion, METHODOLOGY_VERSION),
        gte(materialPressureSnapshots.snapshotDate, afterDate),
      ),
    );
}

/**
 * Load per-trade monthly average vendor prices from material_vendor_prices,
 * joined through material_items.trade.
 *
 * This drives the 'supplier' signal component in the trade pressure score.
 * Aggregates across ALL orgs (admin DB) for a platform-level signal.
 *
 * CONSTRAINTS:
 * - Only ILS-priced entries are included to avoid currency mixing.
 * - Requires material_items.trade to be set (added in migration 0138).
 * - Returns empty if no data is tagged — supplier component will be null.
 *
 * DISCLAIMER: Indication tool only. Not a forecast or financial commitment signal.
 */
export async function loadSupplierSignalsByTrade(db: DbExecutor): Promise<SupplierSignals> {
  const rows = await db
    .select({
      trade: materialItems.trade,
      month: sql<string>`to_char(date_trunc('month', ${materialVendorPrices.effectiveFrom}::date), 'YYYY-MM')`,
      avgPrice: sql<string>`avg(${materialVendorPrices.unitPrice}::numeric)`,
    })
    .from(materialVendorPrices)
    .innerJoin(materialItems, eq(materialVendorPrices.materialItemId, materialItems.id))
    .where(
      and(
        isNotNull(materialItems.trade),
        isNotNull(materialVendorPrices.effectiveFrom),
        // Filter to ILS to avoid cross-currency price mixing in the average
        eq(materialVendorPrices.currency, 'ILS'),
      ),
    )
    .groupBy(
      materialItems.trade,
      sql`date_trunc('month', ${materialVendorPrices.effectiveFrom}::date)`,
    )
    .orderBy(materialItems.trade, sql`date_trunc('month', ${materialVendorPrices.effectiveFrom}::date)`);

  const out: SupplierSignals = {};
  for (const row of rows) {
    if (!row.trade || !row.month || row.avgPrice === null) continue;
    const trade = row.trade as MaterialTrade;
    if (!out[trade]) out[trade] = {};
    const parsed = parseFloat(row.avgPrice);
    if (!isNaN(parsed) && parsed > 0) {
      out[trade]![row.month] = parsed;
    }
  }
  return out;
}
