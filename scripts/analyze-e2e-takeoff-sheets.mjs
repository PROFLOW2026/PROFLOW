/**
 * Per-sheet detection stats from E2E postgres (last job).
 * Countable = not legend_zone and not unconfirmed pdf_only (mirrors counting-policy.ts).
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e';
const sql = postgres(url, { max: 1, prepare: false });

function countable(payload) {
  const reasons = payload.reasons ?? [];
  if (reasons.includes('legend_zone')) return false;
  if (reasons.includes('pdf_only') && payload.status !== 'confirmed') return false;
  return true;
}

const [job] = await sql`
  SELECT id, result_stats FROM takeoff_jobs ORDER BY created_at DESC LIMIT 1`;
if (!job) {
  console.log('no jobs');
  process.exit(0);
}

const sheets = await sql`
  SELECT s.sheet_key, s.file_id, s.payload, f.name AS file_name
  FROM takeoff_sheets s
  LEFT JOIN takeoff_files f ON f.id = s.file_id
  WHERE s.job_id = ${job.id}
  ORDER BY s.payload->>'kind', s.sheet_key`;

const dets = await sql`
  SELECT sheet_key, payload->>'fileId' AS file_id, payload
  FROM takeoff_detections WHERE job_id = ${job.id}`;

const bySheet = new Map();
for (const row of dets) {
  const key = `${row.file_id}::${row.sheet_key}`;
  const p = row.payload;
  const reasons = p.reasons ?? [];
  const entry = bySheet.get(key) ?? {
    file_id: row.file_id,
    sheet_key: row.sheet_key,
    total: 0,
    dwg: 0,
    pdf: 0,
    legend_zone: 0,
    pdf_only: 0,
    countable: 0,
    twins: 0,
  };
  entry.total += 1;
  if (p.source === 'dwg') entry.dwg += 1;
  if (p.source === 'pdf') entry.pdf += 1;
  if (reasons.includes('legend_zone')) entry.legend_zone += 1;
  if (reasons.includes('pdf_only')) entry.pdf_only += 1;
  if (p.twinId) entry.twins += 1;
  if (countable(p)) entry.countable += 1;
  bySheet.set(key, entry);
}

console.log('job', job.id);
console.log('worker result_stats', job.result_stats);
console.log('\nper-sheet (detections from DB):');
console.table(
  sheets.map((s) => {
    const p = s.payload;
    const key = `${s.file_id}::${s.sheet_key}`;
    const agg = bySheet.get(key) ?? { total: 0, countable: 0, legend_zone: 0, dwg: 0, pdf: 0, twins: 0 };
    return {
      sheet_key: s.sheet_key,
      kind: p.kind,
      file: s.file_name?.slice(0, 24),
      hidden_layers: p.hiddenByLayers ?? 0,
      det_total: agg.total,
      det_dwg: agg.dwg,
      det_pdf: agg.pdf,
      legend_zone: agg.legend_zone,
      countable: agg.countable,
      twin_ids: agg.twins,
    };
  }),
);

await sql.end();