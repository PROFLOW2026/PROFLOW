import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withRawPglite } from '@tests/setup/database';
import { normalizeCatalogNameHe } from '@/modules/electrical-takeoff/domain/catalog';

const sql = readFileSync(
  path.join(process.cwd(), 'drizzle/migrations/0216_takeoff_catalog_types_library_write.sql'),
  'utf8',
);

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ROW_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROW_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROW_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ROW_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const STUB_SCHEMA = `
  CREATE SCHEMA IF NOT EXISTS app;
  DO $role$
  BEGIN
    CREATE ROLE authenticated;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END
  $role$;
  DO $role_svc$
  BEGIN
    CREATE ROLE service_role;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END
  $role_svc$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY);
  CREATE TABLE public.takeoff_catalog_types (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations (id),
    key text NOT NULL,
    payload jsonb NOT NULL,
    built_in boolean NOT NULL DEFAULT false,
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE OR REPLACE FUNCTION app.is_org_member(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE AS $fn$
      SELECT coalesce(current_setting('test.org_id', true), '') = p_organization_id::text
    $fn$;
  CREATE OR REPLACE FUNCTION app.has_org_permission(p_organization_id uuid, p_permission text) RETURNS boolean
    LANGUAGE sql STABLE AS $fn$
      SELECT coalesce(current_setting('test.org_id', true), '') = p_organization_id::text
         AND (',' || coalesce(current_setting('test.perms', true), '') || ',')
           LIKE ('%,' || p_permission || ',%')
    $fn$;
  GRANT USAGE ON SCHEMA public TO authenticated;
  GRANT USAGE ON SCHEMA app TO authenticated;
  GRANT EXECUTE ON FUNCTION app.is_org_member(uuid) TO authenticated;
  GRANT EXECUTE ON FUNCTION app.has_org_permission(uuid, text) TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.takeoff_catalog_types TO authenticated;
  ALTER TABLE public.takeoff_catalog_types ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.takeoff_catalog_types FORCE ROW LEVEL SECURITY;
  CREATE POLICY takeoff_catalog_types_select ON public.takeoff_catalog_types
    FOR SELECT TO authenticated
    USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.view'));
  CREATE POLICY takeoff_catalog_types_write ON public.takeoff_catalog_types
    FOR ALL TO authenticated
    USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.manage'))
    WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'takeoff.manage'));
  CREATE POLICY takeoff_catalog_types_service ON public.takeoff_catalog_types
    FOR ALL TO service_role USING (true) WITH CHECK (true);
`;

type CatalogRow = {
  id: string;
  key: string;
  archived: boolean;
  payload: { nameHe?: string };
  name_norm?: string;
};

async function stubCatalog(client: {
  exec: (query: string) => Promise<unknown>;
  query: <T>(query: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}) {
  await client.exec(STUB_SCHEMA);
  await client.exec(`INSERT INTO public.organizations (id) VALUES ('${ORG_A}'), ('${ORG_B}')`);
}

async function apply0216(client: { exec: (query: string) => Promise<unknown> }) {
  await client.exec(sql);
}

async function columnExists(
  client: { query: (query: string) => Promise<{ rows: unknown[] }> },
  column: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'takeoff_catalog_types' AND column_name = '${column}'`,
  );
  return result.rows.length === 1;
}

function insertRow(id: string, key: string, nameHe: string, archived = false, orgId = ORG_A): string {
  return `
    INSERT INTO public.takeoff_catalog_types (id, organization_id, key, payload, archived)
    VALUES (
      '${id}',
      '${orgId}',
      '${key}',
      jsonb_build_object('nameHe', ${sqlStringLiteral(nameHe)}, 'archived', ${archived}),
      ${archived}
    )
  `;
}

type PolicyRow = { polname: string; cmd: string; using_expr: string; check_expr: string };

async function catalogPolicies(
  client: { query: <T>(query: string) => Promise<{ rows: T[] }> },
): Promise<PolicyRow[]> {
  const result = await client.query<PolicyRow>(
    `SELECT p.polname,
            CASE p.polcmd
              WHEN 'r' THEN 'SELECT'
              WHEN 'a' THEN 'INSERT'
              WHEN 'w' THEN 'UPDATE'
              WHEN 'd' THEN 'DELETE'
              WHEN '*' THEN 'ALL'
              ELSE p.polcmd::text
            END AS cmd,
            coalesce(pg_get_expr(p.polqual, p.polrelid), '') AS using_expr,
            coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS check_expr
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'takeoff_catalog_types'
     ORDER BY p.polname`,
  );
  return result.rows;
}

async function asAuthenticated(
  client: { exec: (query: string) => Promise<unknown> },
  orgId: string,
  perms: readonly string[],
  run: () => Promise<void>,
): Promise<void> {
  await client.exec('SET ROLE authenticated');
  await client.exec(`SELECT set_config('test.org_id', '${orgId}', false)`);
  await client.exec(`SELECT set_config('test.perms', '${perms.join(',')}', false)`);
  try {
    await run();
  } finally {
    await client.exec('RESET ROLE');
    await client.exec(`SELECT set_config('test.org_id', '', false)`);
    await client.exec(`SELECT set_config('test.perms', '', false)`);
  }
}

function sqlStringLiteral(value: string): string {
  return `E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

describe('migration 0216 takeoff catalog types', () => {
  it('is prepared-only, fail-closed on duplicates, and does not archive or delete rows', () => {
    expect(sql).toMatch(/PREPARED ONLY/i);
    expect(sql).toContain('BEGIN TRANSACTION READ ONLY');
    expect(sql).toContain('0216_preflight_duplicates');
    expect(sql).toContain('duplicate_active_name');
    expect(sql).toContain('empty_active_name');
    expect(sql).toContain('payload_not_object');
    expect(sql).toContain('app.normalize_takeoff_catalog_name');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS name_norm');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS takeoff_catalog_types_org_name_active_uq');
    expect(sql).toContain("has_org_permission(organization_id, 'takeoff.library.manage')");
    expect(sql).toContain('DROP POLICY IF EXISTS takeoff_catalog_types_write');
    expect(sql).toContain('FOR INSERT TO authenticated');
    expect(sql).toContain('FOR UPDATE TO authenticated');
    expect(sql).not.toMatch(/FOR ALL TO authenticated/);
    expect(sql).not.toMatch(/FOR DELETE/);
    expect(sql).not.toMatch(/GRANT DELETE/i);
    expect(sql).not.toMatch(/DROP POLICY IF EXISTS takeoff_catalog_types_select/);
    expect(sql).not.toMatch(/DROP POLICY IF EXISTS takeoff_catalog_types_service/);
    expect(sql).not.toMatch(/CREATE POLICY takeoff_catalog_types_select/);
    expect(sql).not.toMatch(/CREATE POLICY takeoff_catalog_types_service/);
    expect(sql).not.toMatch(/archived\s*=\s*true/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.takeoff_catalog_types/i);
    expect(sql).not.toMatch(/payload\s*=/i);
    expect(sql.indexOf('0216_preflight_duplicates')).toBeLessThan(sql.indexOf('ADD COLUMN IF NOT EXISTS name_norm'));
    expect(sql.indexOf('ADD COLUMN IF NOT EXISTS name_norm')).toBeLessThan(
      sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS takeoff_catalog_types_org_name_active_uq'),
    );
  });

  it('applies to an empty catalog table', async () => {
    await withRawPglite(async (client) => {
      await stubCatalog(client);
      await apply0216(client);

      expect(await columnExists(client, 'name_norm')).toBe(true);
      const index = await client.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'takeoff_catalog_types_org_name_active_uq'`,
      );
      expect(index.rows).toHaveLength(1);

      const policies = await catalogPolicies(client);
      const byName = Object.fromEntries(policies.map((policy) => [policy.polname, policy]));
      expect(byName.takeoff_catalog_types_write).toBeUndefined();
      expect(byName.takeoff_catalog_types_insert?.cmd).toBe('INSERT');
      expect(byName.takeoff_catalog_types_insert?.check_expr).toContain('takeoff.library.manage');
      expect(byName.takeoff_catalog_types_insert?.check_expr).not.toContain('takeoff.manage');
      expect(byName.takeoff_catalog_types_update?.cmd).toBe('UPDATE');
      expect(byName.takeoff_catalog_types_update?.using_expr).toContain('takeoff.library.manage');
      expect(byName.takeoff_catalog_types_select?.cmd).toBe('SELECT');
      expect(byName.takeoff_catalog_types_select?.using_expr).toContain('takeoff.view');
      expect(byName.takeoff_catalog_types_service?.cmd).toBe('ALL');
      expect(policies.some((policy) => policy.cmd === 'DELETE')).toBe(false);
      expect(policies.some((policy) => policy.cmd === 'ALL' && policy.polname !== 'takeoff_catalog_types_service')).toBe(
        false,
      );
    });
  });

  it('backfills existing unique names without changing display names or archive flags', async () => {
    await withRawPglite(async (client) => {
      await stubCatalog(client);
      await client.exec(insertRow(ROW_1, 'custom.control.stair', '  לחצן   חדר מדרגות '));
      await client.exec(insertRow(ROW_2, 'custom.control.old', 'ישן', true));
      await apply0216(client);

      const rows = (
        await client.query<CatalogRow>(
          `SELECT id, key, archived, payload, name_norm
           FROM public.takeoff_catalog_types
           ORDER BY key`,
        )
      ).rows;

      const stair = rows.find((row) => row.key === 'custom.control.stair');
      const old = rows.find((row) => row.key === 'custom.control.old');
      expect(stair?.payload.nameHe).toBe('  לחצן   חדר מדרגות ');
      expect(stair?.archived).toBe(false);
      expect(stair?.name_norm).toBe('לחצן חדר מדרגות');
      expect(old?.payload.nameHe).toBe('ישן');
      expect(old?.archived).toBe(true);
      expect(old?.name_norm).toBe('');
    });
  });

  it('stops on active duplicates, reports both rows, and leaves schema and data unchanged', async () => {
    await withRawPglite(async (client) => {
      await stubCatalog(client);
      await client.exec(insertRow(ROW_1, 'custom.control.a', 'לחצן חדר מדרגות'));
      await client.exec(insertRow(ROW_2, 'custom.control.b', '  לחצן\u00A0חדר מדרגות '));
      await client.exec(insertRow(ROW_3, 'custom.control.kept', 'מפסק אחר'));

      const before = (
        await client.query<CatalogRow>(
          `SELECT id, key, archived, payload FROM public.takeoff_catalog_types ORDER BY key`,
        )
      ).rows;

      let message = '';
      try {
        await apply0216(client);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain('0216_preflight_duplicates');
      expect(message).toContain('custom.control.a');
      expect(message).toContain('custom.control.b');
      expect(await columnExists(client, 'name_norm')).toBe(false);
      const fn = await client.query(
        `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'normalize_takeoff_catalog_name'`,
      );
      expect(fn.rows).toHaveLength(0);
      const index = await client.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'takeoff_catalog_types_org_name_active_uq'`,
      );
      expect(index.rows).toHaveLength(0);

      const write = await client.query<{ def: string }>(
        `SELECT pg_get_expr(polqual, polrelid) AS def
         FROM pg_policy WHERE polname = 'takeoff_catalog_types_write'`,
      );
      expect(write.rows[0]?.def ?? '').toContain('takeoff.manage');

      const after = (
        await client.query<CatalogRow>(
          `SELECT id, key, archived, payload FROM public.takeoff_catalog_types ORDER BY key`,
        )
      ).rows;
      expect(after).toEqual(before);
      expect(after.filter((row) => row.archived)).toHaveLength(0);
    });
  });

  it('is idempotent on a second apply after a successful first apply', async () => {
    await withRawPglite(async (client) => {
      await stubCatalog(client);
      await client.exec(insertRow(ROW_1, 'custom.control.stair', 'לחצן חדר מדרגות'));
      await apply0216(client);
      await apply0216(client);

      const rows = (
        await client.query<CatalogRow>(
          `SELECT key, archived, payload, name_norm FROM public.takeoff_catalog_types`,
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload.nameHe).toBe('לחצן חדר מדרגות');
      expect(rows[0]?.name_norm).toBe('לחצן חדר מדרגות');
      expect(rows[0]?.archived).toBe(false);
      expect(await columnExists(client, 'name_norm')).toBe(true);
    });
  });

  it('allows empty active names and archived rows that share a name with an active row', async () => {
    await withRawPglite(async (client) => {
      await stubCatalog(client);
      await client.exec(insertRow(ROW_1, 'custom.control.stair', 'לחצן חדר מדרגות'));
      await client.exec(insertRow(ROW_2, 'custom.control.old', 'לחצן חדר מדרגות', true));
      await client.exec(insertRow(ROW_3, 'custom.control.blank', '   '));
      await apply0216(client);

      const rows = (
        await client.query<CatalogRow>(
          `SELECT key, archived, payload, name_norm FROM public.takeoff_catalog_types ORDER BY key`,
        )
      ).rows;
      expect(rows.find((row) => row.key === 'custom.control.stair')?.name_norm).toBe('לחצן חדר מדרגות');
      expect(rows.find((row) => row.key === 'custom.control.old')?.archived).toBe(true);
      expect(rows.find((row) => row.key === 'custom.control.old')?.name_norm).toBe('');
      expect(rows.find((row) => row.key === 'custom.control.blank')?.archived).toBe(false);
      expect(rows.find((row) => row.key === 'custom.control.blank')?.payload.nameHe).toBe('   ');
      expect(rows.find((row) => row.key === 'custom.control.blank')?.name_norm).toBe('');
    });
  });

  it('matches TypeScript normalizeCatalogNameHe for Hebrew, Unicode, and missing names', async () => {
    await withRawPglite(async (client) => {
      await stubCatalog(client);
      await apply0216(client);

      const samples = [
        'לחצן חדר מדרגות',
        '  לחצן   חדר מדרגות ',
        'לחצן\u00A0חדר מדרגות',
        '',
        '   ',
        '\u00A0',
        'מפסק\tיחיד',
        '\u05E9\u05C1\u05DC\u05D5\u05DD',
      ];
      for (const sample of samples) {
        const result = await client.query<{ n: string }>(
          `SELECT app.normalize_takeoff_catalog_name($1) AS n`,
          [sample],
        );
        expect(result.rows[0]?.n, sample).toBe(normalizeCatalogNameHe(sample));
      }
    });
  });

  it('keeps SELECT on takeoff.view, write on library.manage, no DELETE, and isolates orgs', async () => {
    await withRawPglite(async (client) => {
      await stubCatalog(client);
      await client.exec(insertRow(ROW_1, 'custom.control.stair', 'לחצן חדר מדרגות'));
      await client.exec(insertRow(ROW_B, 'custom.control.other', 'אחר', false, ORG_B));
      await apply0216(client);

      await asAuthenticated(client, ORG_A, ['takeoff.view'], async () => {
        const visible = await client.query<{ key: string }>(
          `SELECT key FROM public.takeoff_catalog_types ORDER BY key`,
        );
        expect(visible.rows.map((row) => row.key)).toEqual(['custom.control.stair']);
        await expect(
          client.exec(
            `INSERT INTO public.takeoff_catalog_types (id, organization_id, key, payload)
             VALUES (gen_random_uuid(), '${ORG_A}', 'custom.control.x', '{"nameHe":"x"}')`,
          ),
        ).rejects.toBeTruthy();
        const updated = await client.query(
          `UPDATE public.takeoff_catalog_types SET payload = payload WHERE key = 'custom.control.stair' RETURNING id`,
        );
        expect(updated.rows).toHaveLength(0);
        const deleted = await client.query(
          `DELETE FROM public.takeoff_catalog_types WHERE key = 'custom.control.stair' RETURNING id`,
        );
        expect(deleted.rows).toHaveLength(0);
      });

      await asAuthenticated(client, ORG_A, ['takeoff.manage'], async () => {
        const visible = await client.query<{ key: string }>(`SELECT key FROM public.takeoff_catalog_types`);
        expect(visible.rows).toEqual([]);
        await expect(
          client.exec(
            `INSERT INTO public.takeoff_catalog_types (id, organization_id, key, payload)
             VALUES (gen_random_uuid(), '${ORG_A}', 'custom.control.y', '{"nameHe":"y"}')`,
          ),
        ).rejects.toBeTruthy();
      });

      await asAuthenticated(client, ORG_A, ['takeoff.library.manage'], async () => {
        const visible = await client.query<{ key: string }>(`SELECT key FROM public.takeoff_catalog_types`);
        expect(visible.rows).toEqual([]);
        await client.exec(
          `INSERT INTO public.takeoff_catalog_types (id, organization_id, key, payload, name_norm)
           VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '${ORG_A}', 'custom.control.new', '{"nameHe":"חדש"}', 'חדש')`,
        );
        const hiddenUpdate = await client.query(
          `UPDATE public.takeoff_catalog_types SET name_norm = 'לחצן' WHERE key = 'custom.control.stair' RETURNING key`,
        );
        expect(hiddenUpdate.rows).toHaveLength(0);
        await expect(
          client.exec(
            `INSERT INTO public.takeoff_catalog_types (id, organization_id, key, payload, name_norm)
             VALUES (gen_random_uuid(), '${ORG_B}', 'custom.control.cross', '{"nameHe":"חצי"}', 'חצי')`,
          ),
        ).rejects.toBeTruthy();
      });

      await asAuthenticated(client, ORG_A, ['takeoff.view', 'takeoff.library.manage'], async () => {
        const visible = await client.query<{ key: string }>(
          `SELECT key FROM public.takeoff_catalog_types ORDER BY key`,
        );
        expect(visible.rows.map((row) => row.key)).toEqual(['custom.control.new', 'custom.control.stair']);
        const updated = await client.query(
          `UPDATE public.takeoff_catalog_types SET name_norm = 'לחצן' WHERE key = 'custom.control.stair' RETURNING key`,
        );
        expect(updated.rows).toHaveLength(1);
        const deleted = await client.query(
          `DELETE FROM public.takeoff_catalog_types WHERE key = 'custom.control.new' RETURNING id`,
        );
        expect(deleted.rows).toHaveLength(0);
      });

      const remaining = await client.query<{ key: string }>(
        `SELECT key FROM public.takeoff_catalog_types ORDER BY key`,
      );
      expect(remaining.rows.map((row) => row.key)).toEqual([
        'custom.control.new',
        'custom.control.other',
        'custom.control.stair',
      ]);
    });
  });
});
