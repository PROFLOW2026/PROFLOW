import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySqlMigrations, withRawPglite } from '@tests/setup/database';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

async function tableExists(
  client: { query: (sql: string) => Promise<{ rows: unknown[] }> },
  schema: string,
  table: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = '${schema}' AND table_name = '${table}'`,
  );
  return result.rows.length === 1;
}

describe('migration hardening 0055-0058 owner SQL review', () => {
  it('does not rewrite historical 0000–0054 files', async () => {
    const journal = await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8');
    expect(journal).toContain('0054_product_experience');
    expect(journal).toContain('0055_next_gen_permissions');
    expect(journal).toContain('0056_closeout_warranty');
    expect(journal).toContain('0057_communications_calendar');
    expect(journal).toContain('0058_automations_integrations_assistant');
  });

  it('SQL comments describe the single integration foundation and fail-closed owners', async () => {
    const sql0055 = await readFile(path.join(MIGRATIONS_DIR, '0055_next_gen_permissions.sql'), 'utf8');
    const sql0056 = await readFile(path.join(MIGRATIONS_DIR, '0056_closeout_warranty.sql'), 'utf8');
    const sql0057 = await readFile(path.join(MIGRATIONS_DIR, '0057_communications_calendar.sql'), 'utf8');
    const sql0058 = await readFile(path.join(MIGRATIONS_DIR, '0058_automations_integrations_assistant.sql'), 'utf8');

    expect(sql0055).toMatch(/install_org_parent_table_rls/);
    expect(sql0055).toMatch(/next_gen_latch_acquire/);
    expect(sql0056).toMatch(/project_closeout_events_closeout_project_fk/);
    expect(sql0056).toMatch(/append-only/);
    expect(sql0056).toMatch(/can_access_next_gen_document_owner/);
    expect(sql0056).toMatch(/jobs and work orders cannot enter classic closeout/);
    expect(sql0056).toMatch(/close_project_via_closeout/);
    expect(sql0056).toMatch(/organization_business_date/);
    expect(sql0056).not.toMatch(/actual_end_date = \(clock_timestamp\(\) AT TIME ZONE 'utc'\)/);
    expect(sql0056).toMatch(/SECURITY DEFINER[\s\S]*projects_classic_closeout_status_guard/);
    expect(sql0056).toMatch(/SECURITY DEFINER[\s\S]*projects_closeout_history_delete_guard/);
    expect(sql0056).toMatch(/REVOKE ALL ON FUNCTION app.close_project_via_closeout\(uuid, uuid, text, jsonb, uuid\) FROM authenticated/);
    expect(sql0056).toMatch(/work_kind cannot leave project once closeout exists/);
    expect(sql0056).toMatch(/closeout history cannot be erased/);
    expect(sql0056).toMatch(/projects: classic projects close and reopen only through closeout/);
    expect(sql0057).toMatch(/SECURITY DEFINER[\s\S]*outbound_communications_delete_guard/);
    expect(sql0057).toMatch(/SECURITY DEFINER[\s\S]*outbound_communication_attachments_guard/);
    expect(sql0057).toMatch(/an attachment is no longer accessible/);
    expect(sql0057).toMatch(/REVOKE ALL ON FUNCTION app.next_gen_related_project_id\(uuid, text, uuid\) FROM authenticated/);
    expect(sql0057).toMatch(/sent and sending messages cannot be deleted/);
    expect(sql0057).toMatch(/REVOKE ALL ON FUNCTION app.confirm_outbound_communication_delivery\(uuid, uuid, text, text\) FROM authenticated/);
    expect(sql0058).toMatch(/REVOKE ALL ON FUNCTION app.insert_assistant_trusted_message\(uuid, uuid, text, text, jsonb, jsonb\) FROM authenticated/);
    expect(sql0058).toMatch(/SECURITY DEFINER[\s\S]*assistant_conversations_history_delete_guard/);
    expect(sql0058).toMatch(/documentIds/);
    expect(sql0058).toMatch(/access_scope_json/);
    expect(sql0058).toMatch(/ap_payment/);
    expect(sql0058).toMatch(/record_automation_run/);
    expect(sql0057).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.calendar_provider_connections/);
    expect(sql0057).toMatch(/confirm_outbound_communication_delivery/);
    expect(sql0057).toMatch(/sent requires confirmed provider delivery/);
    expect(sql0057).toMatch(/install_org_parent_table_rls/);
    expect(sql0058).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.assistant_provider_connections/);
    const orgIntegrationsCreate = sql0058.match(
      /CREATE TABLE IF NOT EXISTS public\.organization_integrations \([\s\S]*?\n\);/,
    )?.[0];
    expect(orgIntegrationsCreate).toBeTruthy();
    expect(orgIntegrationsCreate).not.toMatch(/credentials_ref/);
    expect(sql0058).toMatch(/app\.integration_credential_refs/);
    expect(sql0058).toMatch(/insert_assistant_trusted_message/);
    expect(sql0058).toMatch(/role = 'user'/);
    expect(sql0058).toMatch(/assistant_message_still_permitted/);
    expect(sql0058).toMatch(/integration_entity_mapping_guard/);
  });

  it('clean-starts without duplicate connection tables or tenant-readable credential refs', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);

      expect(await tableExists(client, 'public', 'project_closeouts')).toBe(true);
      expect(await tableExists(client, 'public', 'outbound_communications')).toBe(true);
      expect(await tableExists(client, 'public', 'organization_integrations')).toBe(true);
      expect(await tableExists(client, 'public', 'calendar_provider_connections')).toBe(false);
      expect(await tableExists(client, 'public', 'assistant_provider_connections')).toBe(false);
      expect(await tableExists(client, 'app', 'integration_credential_refs')).toBe(true);

      const credCol = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'organization_integrations'
           AND column_name = 'credentials_ref'`,
      );
      expect(credCol.rows).toEqual([]);

      const grants = await client.query(
        `SELECT grantee, privilege_type
         FROM information_schema.role_table_grants
         WHERE table_schema = 'app'
           AND table_name = 'integration_credential_refs'
           AND grantee IN ('authenticated', 'anon')`,
      );
      expect(grants.rows).toEqual([]);
    });
  });
});
