/**
 * Self-contained research parity check — no DB, no desktop paths.
 * Fetches public FRED/CBS series, runs the production engine, compares to validated research rows.
 *
 * npx tsx scripts/material-market-parity-check.ts
 */
import { finalizeCompleteSnapshots } from '../src/modules/material-market/domain/complete-snapshot.ts';
import {
  blendCbsPlumbing,
  buildCopperIls,
  computeAllTradeSnapshots,
} from '../src/modules/material-market/domain/pressure-engine.ts';
import { createCbsAdapter } from '../src/modules/material-market/sources/cbs-adapter.ts';
import { createFredAdapter } from '../src/modules/material-market/sources/fred-adapter.ts';
import { FRED_SERIES, CBS_SERIES } from '../src/modules/material-market/domain/methodology.ts';

const FROM = '2016-01';
const TO = '2026-08';

/** Validated against research with production config (no local supplier series). */
const EXPECTATIONS = [
  { date: '2026-07-01', trade: 'electrical', score: 53.33, direction: 'neutral', momentum: 'stable' },
  { date: '2026-08-01', trade: 'plumbing', score: 66.9, direction: 'up', momentum: 'rising' },
  { date: '2026-08-01', trade: 'steel_rebar', score: 61.08, direction: 'up', momentum: 'rising_fast' },
  { date: '2026-07-01', trade: 'steel_rebar', score: 37.8, direction: 'down', momentum: 'falling_fast' },
] as const;

async function fetchAllDrivers() {
  const fredEntries = Object.entries(FRED_SERIES) as [keyof typeof FRED_SERIES, string][];
  const cbsEntries = Object.entries(CBS_SERIES) as [keyof typeof CBS_SERIES, string][];

  const raw: Record<string, Record<string, number>> = {};
  for (const [code, seriesId] of fredEntries) {
    raw[code] = await createFredAdapter(code, seriesId).fetchRange(FROM, TO);
  }
  for (const [code, cbsId] of cbsEntries) {
    raw[code] = await createCbsAdapter(code, cbsId).fetchRange(FROM, TO);
  }

  const copperIls = buildCopperIls(raw.COPPER_USD ?? {}, raw.USD_ILS ?? {});
  const plumbingBlend = blendCbsPlumbing(raw.CBS_PLUMBING ?? {}, raw.CBS_PLASTIC_PIPES ?? {});

  return {
    COPPER_ILS: copperIls,
    CBS_CONDUCTORS: raw.CBS_CONDUCTORS ?? {},
    USD_ILS: raw.USD_ILS ?? {},
    ALUMINIUM_USD: raw.ALUMINIUM_USD ?? {},
    OIL_OR_ENERGY: raw.OIL_OR_ENERGY ?? {},
    CBS_PLUMBING_BLEND: plumbingBlend,
    PVC_POLYMER_PROXY: raw.PVC_POLYMER_PROXY ?? {},
    CBS_REBAR: raw.CBS_REBAR ?? {},
    STEEL_SCRAP: raw.STEEL_SCRAP ?? {},
    IRON_ORE: raw.IRON_ORE ?? {},
    HRC_STEEL: raw.HRC_STEEL ?? {},
  };
}

async function main() {
  console.log('[parity] fetching public sources…');
  const drivers = await fetchAllDrivers();
  const snapshots = finalizeCompleteSnapshots(computeAllTradeSnapshots(drivers));

  let failed = 0;
  for (const exp of EXPECTATIONS) {
    const row = snapshots.find((s) => s.trade === exp.trade && s.snapshotDate === exp.date);
    if (!row) {
      console.error(`FAIL missing ${exp.trade} ${exp.date}`);
      failed += 1;
      continue;
    }
    const scoreOk = Math.abs(row.pressureScore - exp.score) <= 0.5;
    const dirOk = row.pressureDirection === exp.direction;
    const momOk = row.pressureMomentum === exp.momentum;
    if (!scoreOk || !dirOk || !momOk) {
      console.error(
        `FAIL ${exp.trade} ${exp.date}: got score=${row.pressureScore} dir=${row.pressureDirection} mom=${row.pressureMomentum}, expected score≈${exp.score} dir=${exp.direction} mom=${exp.momentum}`,
      );
      failed += 1;
    } else {
      console.log(`PASS ${exp.trade} ${exp.date}: ${row.pressureScore} ${row.pressureDirection}`);
    }
  }

  if (failed > 0) {
    console.error(`[parity] ${failed} expectation(s) failed`);
    process.exit(1);
  }
  console.log('[parity] all expectations passed');
}

main().catch((error) => {
  console.error('[parity] error', error);
  process.exit(1);
});
