import 'server-only';
import { getAdminDb } from '@/shared/db/client';
import {
  deactivateSourcesExcept,
  getLatestObservationDate,
  listSourcesByCode,
  loadSeriesByCodes,
  markSourceError,
  upsertObservations,
  upsertSnapshots,
  upsertSourceSeed,
} from '../data/repositories';
import { computeSnapshotsFromDb } from './compute-snapshots';
import { ACTIVE_SOURCE_CODES, createFetchAdapters, SOURCE_SEED } from '../sources/registry';
import { buildCopperIls, blendCbsPlumbing } from '../domain/pressure-engine';

const BOOTSTRAP_FROM = '2016-01';

function currentYm(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthBefore(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${(m - 1).toString().padStart(2, '0')}`;
}

export interface MaterialMarketRefreshResult {
  sourcesUpdated: number;
  observationsUpserted: number;
  snapshotsWritten: number;
  errors: string[];
}

export async function runMaterialMarketRefresh(): Promise<MaterialMarketRefreshResult> {
  const db = getAdminDb();
  const errors: string[] = [];
  let sourcesUpdated = 0;
  let observationsUpserted = 0;

  await upsertSourceSeed(db, SOURCE_SEED);
  await deactivateSourcesExcept(db, [...ACTIVE_SOURCE_CODES]);
  const sourceMap = await listSourcesByCode(db);
  const toYm = currentYm();

  for (const adapter of createFetchAdapters()) {
    const source = sourceMap.get(adapter.code);
    if (!source?.id) continue;
    const latest = await getLatestObservationDate(db, source.id);
    const fromYm = latest ? monthBefore(latest.slice(0, 7)) : BOOTSTRAP_FROM;
    if (fromYm > toYm) continue;
    try {
      const series = await adapter.fetchRange(fromYm, toYm);
      const count = await upsertObservations(db, source.id, series);
      if (count > 0) sourcesUpdated += 1;
      observationsUpserted += count;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${adapter.code}: ${message}`);
      await markSourceError(db, source.id, message);
    }
  }

  const copperSource = sourceMap.get('COPPER_ILS');
  if (copperSource?.id) {
    const raw = await loadSeriesByCodes(db, ['COPPER_USD', 'USD_ILS']);
    const derived = buildCopperIls(raw.COPPER_USD ?? {}, raw.USD_ILS ?? {});
    observationsUpserted += await upsertObservations(db, copperSource.id, derived);
  }

  const blendSource = sourceMap.get('CBS_PLUMBING_BLEND');
  if (blendSource?.id) {
    const raw = await loadSeriesByCodes(db, ['CBS_PLUMBING', 'CBS_PLASTIC_PIPES']);
    const derived = blendCbsPlumbing(raw.CBS_PLUMBING ?? {}, raw.CBS_PLASTIC_PIPES ?? {});
    observationsUpserted += await upsertObservations(db, blendSource.id, derived);
  }

  const snapshots = await computeSnapshotsFromDb(db);
  const snapshotsWritten = await upsertSnapshots(db, snapshots);

  return { sourcesUpdated, observationsUpserted, snapshotsWritten, errors };
}
