/**
 * Post-bootstrap verification for material market tables.
 * npx tsx scripts/material-market-db-verify.ts
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('No DIRECT_DATABASE_URL or DATABASE_URL');
  process.exit(1);
}

async function main() {
  const sql = postgres(url!, { max: 1, prepare: false });

  try {
    const journal = JSON.parse(
      readFileSync('drizzle/migrations/meta/_journal.json', 'utf8'),
    ) as { entries: { tag: string }[] };
    const expectedCount = journal.entries.length;

    const [{ count: applied }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
    `;
    if (applied < expectedCount) {
      console.error(`FAIL: expected >= ${expectedCount} migrations, got ${applied}`);
      process.exit(1);
    }

    const [reg] = await sql<
      { sources: boolean; observations: boolean; snapshots: boolean }[]
    >`
      SELECT
        to_regclass('public.material_market_sources') IS NOT NULL AS sources,
        to_regclass('public.material_market_observations') IS NOT NULL AS observations,
        to_regclass('public.material_pressure_snapshots') IS NOT NULL AS snapshots
    `;
    if (!reg.sources || !reg.observations || !reg.snapshots) {
      console.error('FAIL: migration 0132 tables missing', reg);
      process.exit(1);
    }
    console.log(`PASS: migration journal applied (${applied}/${expectedCount}), 0132 tables present`);

    const [sourceStats] = await sql<
      { total: number; active: number; with_errors: number }[]
    >`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE is_active)::int AS active,
        count(*) FILTER (WHERE last_error IS NOT NULL)::int AS with_errors
      FROM material_market_sources
    `;
    console.log('SOURCES:', sourceStats);
    if (sourceStats.total < 16 || sourceStats.active < 16) {
      console.error('FAIL: source registry under-populated');
      process.exit(1);
    }
    if (sourceStats.with_errors > 0) {
      const errs = await sql`
        SELECT code, last_error FROM material_market_sources WHERE last_error IS NOT NULL
      `;
      console.error('FAIL: source errors', errs);
      process.exit(1);
    }
    console.log('PASS: no source errors');

    const [{ total: obsTotal }] = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM material_market_observations
    `;
    console.log('OBSERVATIONS:', obsTotal);
    if (obsTotal < 100) {
      console.error('FAIL: observations under-populated');
      process.exit(1);
    }

    const dupObs = await sql`
      SELECT source_id, observation_date, count(*)::int AS c
      FROM material_market_observations
      GROUP BY source_id, observation_date
      HAVING count(*) > 1
      LIMIT 5
    `;
    if (dupObs.length > 0) {
      console.error('FAIL: duplicate observations', dupObs);
      process.exit(1);
    }
    console.log('PASS: no duplicate observations');

    const [{ total: snapTotal }] = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM material_pressure_snapshots
    `;
    console.log('SNAPSHOTS:', snapTotal);
    if (snapTotal < 30) {
      console.error('FAIL: snapshots under-populated');
      process.exit(1);
    }

    const dupSnaps = await sql`
      SELECT trade, snapshot_date, methodology_version, count(*)::int AS c
      FROM material_pressure_snapshots
      GROUP BY trade, snapshot_date, methodology_version
      HAVING count(*) > 1
      LIMIT 5
    `;
    if (dupSnaps.length > 0) {
      console.error('FAIL: duplicate snapshots', dupSnaps);
      process.exit(1);
    }
    console.log('PASS: no duplicate snapshots');

    const latestRows = await sql<
      {
        trade: string;
        snapshot_date: string;
        pressure_score: number;
        pressure_direction: string;
        confidence: string;
        weighted_data_coverage: number;
      }[]
    >`
      SELECT DISTINCT ON (trade)
        trade,
        snapshot_date::text,
        pressure_score,
        pressure_direction,
        confidence,
        weighted_data_coverage
      FROM material_pressure_snapshots
      WHERE weighted_data_coverage >= 0.6
      ORDER BY trade, snapshot_date DESC
    `;
    console.log('LATEST COMPLETE SNAPSHOTS:');
    for (const row of latestRows) {
      console.log(
        `  ${row.trade} ${row.snapshot_date} score=${row.pressure_score} dir=${row.pressure_direction} conf=${row.confidence} cov=${row.weighted_data_coverage}`,
      );
    }
    const trades = new Set(latestRows.map((r) => r.trade));
    if (!trades.has('electrical') || !trades.has('plumbing') || !trades.has('steel_rebar')) {
      console.error('FAIL: missing latest complete snapshot for a trade');
      process.exit(1);
    }
    console.log('PASS: all 3 trades have latest complete snapshots');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
