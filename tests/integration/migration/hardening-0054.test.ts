import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySqlMigrations, splitSqlStatements, withRawPglite } from '@tests/setup/database';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

async function applyNamed(client: { exec: (sql: string) => Promise<unknown> }, tag: string) {
  const raw = await readFile(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    await client.exec(statement);
  }
}

async function tableExists(
  client: { query: (sql: string) => Promise<{ rows: unknown[] }> },
  table: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = '${table}'`,
  );
  return result.rows.length === 1;
}

describe('migration hardening 0054 product experience', () => {
  it('does not rewrite historical 0000–0053 files', async () => {
    const journal = await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8');
    expect(journal).toContain('0054_product_experience');
    expect(journal).toContain('0053_estimates_opportunity');
  });

  it('SQL comments match target-shape, membership SET NULL, and real-target RLS', async () => {
    const raw = await readFile(path.join(MIGRATIONS_DIR, '0054_product_experience.sql'), 'utf8');
    expect(raw).not.toMatch(/exactly-one-target CHECK/);
    expect(raw).toMatch(/optional CONTEXT/i);
    expect(raw).toMatch(/ON DELETE SET NULL \(last_confirmed_by_user_id\)/);
    expect(raw).not.toMatch(/SET NULL\s*\([^)]*organization_id/i);
    expect(raw).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(raw).toMatch(/REVOKE ALL ON public\.ocr_correction_memory FROM anon/);
    expect(raw).toMatch(/app\.ocr_correction_memory_target_allowed/);
    expect(raw).toMatch(/app\.ocr_correction_memory_integrity_guard/);
    expect(raw).toMatch(/app\.ocr_correction_memory_discard_stale_po/);
    expect(raw).toMatch(/BEFORE UPDATE OF project_id, vendor_id, organization_id/);
    expect(raw).toMatch(/mapping_kind='purchase_order' memory is discarded/);
    expect(raw).toMatch(/app\.has_org_permission\(p_organization_id, 'vendors\.read'\)/);
    expect(raw).toMatch(/app\.has_org_permission\(p_organization_id, 'procurement\.read'\)/);
    expect(raw).toMatch(/app\.has_org_permission\(p_organization_id, 'projects\.read'\)/);
    expect(raw).toMatch(/po\.project_id IS NULL OR app\.can_access_project/);
    expect(raw).toMatch(/app\.can_access_project\(p_organization_id, a\.project_id\)/);
    expect(raw).toMatch(/AND project_id IS NOT NULL/);
    expect(raw).toMatch(/cannot attribute confirmation to another user/);
    expect(raw).toMatch(/BEFORE INSERT OR UPDATE\s+ON public\.ocr_correction_memory/);
    expect(raw).not.toMatch(/BEFORE INSERT OR UPDATE OF/);
    expect(raw).toMatch(/NEW\.last_confirmed_at := now\(\)/);
    expect(raw).not.toMatch(/TO anon/);
  });

  it('clean-starts with ocr_correction_memory, checks, unique source, and RLS', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);
      expect(await tableExists(client, 'ocr_correction_memory')).toBe(true);

      const notNull = await client.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ocr_correction_memory'
           AND column_name = 'organization_id'`,
      );
      expect((notNull.rows[0] as { is_nullable: string }).is_nullable).toBe('NO');

      const shape = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname = 'ocr_correction_memory_target_shape'`,
      );
      const shapeDef = String((shape.rows[0] as { def?: string })?.def ?? '');
      expect(shapeDef).toMatch(/mapping_kind = 'vendor'/);
      expect(shapeDef).toMatch(/subcontract_agreement/);
      expect(shapeDef).toMatch(/project_id IS NOT NULL/);

      const uq = await client.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'ocr_correction_memory_org_kind_source_uq'`,
      );
      expect(uq.rows.length).toBe(1);

      const contextIndexes = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE indexname IN (
           'purchase_orders_id_org_vendor_uq',
           'subcontract_agreements_id_org_project_uq',
           'subcontract_agreements_id_org_vendor_uq'
         )
         ORDER BY indexname`,
      );
      expect(contextIndexes.rows).toHaveLength(3);

      const rls = await client.query(
        `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'ocr_correction_memory'`,
      );
      const row = rls.rows[0] as { relrowsecurity: boolean; relforcerowsecurity: boolean };
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);

      const membershipFk = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname = 'ocr_correction_memory_confirmed_by_membership_fk'`,
      );
      const membershipDef = String((membershipFk.rows[0] as { def?: string })?.def ?? '');
      expect(membershipDef).toMatch(/organization_memberships/);
      expect(membershipDef).toMatch(/ON DELETE SET NULL \(last_confirmed_by_user_id\)/i);
      expect(membershipDef.toLowerCase()).not.toMatch(/set null \(.*organization_id/);

      const userFk = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname = 'ocr_correction_memory_confirmed_by_fk'`,
      );
      const def = String((userFk.rows[0] as { def?: string })?.def ?? '');
      expect(def).toMatch(/last_confirmed_by_user_id/);
      expect(def).toMatch(/ON DELETE SET NULL/i);
      expect(def.toLowerCase()).not.toContain('organization_id');

      const discardFn = await client.query(
        `SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'ocr_correction_memory_discard_stale_po'`,
      );
      expect(discardFn.rows.length).toBe(1);

      const discardTrigger = await client.query(
        `SELECT 1 FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'purchase_orders'
           AND t.tgname = 'ocr_correction_memory_discard_stale_po'
           AND NOT t.tgisinternal`,
      );
      expect(discardTrigger.rows.length).toBe(1);
    });
  });

  it('upgrades 0053 → 0054 without rewriting 0000–0053 objects', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0053_estimates_opportunity');
      expect(await tableExists(client, 'ocr_correction_memory')).toBe(false);

      await applyNamed(client, '0054_product_experience');
      expect(await tableExists(client, 'ocr_correction_memory')).toBe(true);

      const membershipFk = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname = 'ocr_correction_memory_confirmed_by_membership_fk'`,
      );
      expect(String((membershipFk.rows[0] as { def?: string })?.def ?? '')).toMatch(
        /ON DELETE SET NULL \(last_confirmed_by_user_id\)/i,
      );

      const discardTrigger = await client.query(
        `SELECT 1 FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'purchase_orders'
           AND t.tgname = 'ocr_correction_memory_discard_stale_po'
           AND NOT t.tgisinternal`,
      );
      expect(discardTrigger.rows.length).toBe(1);
    });
  });
});
