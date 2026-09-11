import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const ORG = process.argv.find((a) => a.startsWith('--org='))?.split('=')[1]
  ?? '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

const { getAdminDb } = await import('@/shared/db/client');
const admin = getAdminDb();
const rows = await admin.execute(sql`
  SELECT reference, issue_date, subtotal_amount, tax_amount, total_amount, tax_snapshot::text, source_kind
  FROM billing_records
  WHERE organization_id = ${ORG}
    AND archived_at IS NULL AND status = 'finalized'
  ORDER BY issue_date
`);
console.log(JSON.stringify(rows, null, 2));
