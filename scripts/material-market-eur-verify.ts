import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) process.exit(1);

const sql = postgres(url, { max: 1, prepare: false });
try {
  const eur = await sql<
    { code: string; n: number; min_d: string; max_d: string }[]
  >`
    SELECT s.code, count(*)::int AS n,
      min(o.observation_date)::text AS min_d,
      max(o.observation_date)::text AS max_d
    FROM material_market_observations o
    JOIN material_market_sources s ON s.id = o.source_id
    WHERE s.code IN ('EUR_ILS', 'EUR_USD')
    GROUP BY s.code ORDER BY s.code
  `;
  const [snap] = await sql<{ pressure_score: string; snapshot_date: string }[]>`
    SELECT pressure_score::text, snapshot_date::text
    FROM material_pressure_snapshots
    WHERE trade = 'electrical' AND methodology_version = 'V1'
      AND weighted_data_coverage >= 0.6
    ORDER BY snapshot_date DESC LIMIT 1
  `;
  console.log(JSON.stringify({ eur, latestElectrical: snap }, null, 2));
} finally {
  await sql.end();
}
