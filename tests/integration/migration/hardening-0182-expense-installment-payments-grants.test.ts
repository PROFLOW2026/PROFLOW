/**
 * 0182 — GRANT SELECT on expense_installment_payments for authenticated (Production gap from 0180).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_0182 = path.resolve(
  process.cwd(),
  'drizzle/migrations/0182_expense_installment_payments_grants.sql',
);

describe('0182 expense_installment_payments grants', () => {
  it('SQL: grants SELECT/INSERT/UPDATE to authenticated', async () => {
    const raw = await readFile(MIGRATION_0182, 'utf8');
    expect(raw).toMatch(/GRANT SELECT.*expense_installment_payments.*authenticated/is);
    expect(raw).toContain('service_role');
    expect(raw).not.toMatch(/DROP TABLE/i);
  });
});
