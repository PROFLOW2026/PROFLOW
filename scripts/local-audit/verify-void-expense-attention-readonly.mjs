/**
 * READ-ONLY — void expense vs attention eligibility (Production via .env.local DATABASE_URL).
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

function loadUrl() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL missing in .env.local');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

const sql = postgres(loadUrl(), { max: 1 });

const target = await sql`
  SELECT e.id, e.status, e.classification_status, e.cost_category_id,
         e.expense_date::text, e.gross_amount::text, e.net_amount::text,
         e.supplier_name, v.name AS vendor_name, p.name AS project_name,
         e.payment_status, e.paid_at::text, e.updated_at::text
  FROM expenses e
  LEFT JOIN vendors v ON v.id = e.vendor_id AND v.organization_id = e.organization_id
  LEFT JOIN projects p ON p.id = e.project_id AND p.organization_id = e.organization_id
  WHERE e.organization_id = ${ORG}::uuid
    AND e.archived_at IS NULL
    AND e.expense_date = '2026-10-11'
    AND ABS(e.gross_amount::numeric - 245) < 0.02
`;

const voidNeedsClassification = await sql`
  SELECT e.id, e.expense_date::text, e.gross_amount::text, e.supplier_name, e.status, e.classification_status
  FROM expenses e
  WHERE e.organization_id = ${ORG}::uuid
    AND e.archived_at IS NULL
    AND e.status = 'void'
    AND e.classification_status = 'needs_classification'
    AND e.voids_expense_id IS NULL
    AND e.adjusts_expense_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM expenses r
      WHERE r.voids_expense_id = e.id
        AND r.organization_id = e.organization_id
        AND r.status = 'finalized'
        AND r.archived_at IS NULL
    )
  ORDER BY e.expense_date, e.id
`;

let audit = [];
if (target.length === 1) {
  audit = await sql`
    SELECT action, created_at::text
    FROM audit_events
    WHERE organization_id = ${ORG}::uuid
      AND entity_type = 'expense'
      AND entity_id = ${target[0].id}::uuid
    ORDER BY created_at
  `;
}

console.log(
  JSON.stringify(
    {
      orgId: ORG,
      targetExpenses: target,
      voidNeedsClassificationCount: voidNeedsClassification.length,
      voidNeedsClassificationRows: voidNeedsClassification,
      auditTrail: audit,
    },
    null,
    2,
  ),
);

await sql.end();
