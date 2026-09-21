import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle', 'migrations');

describe('0121 employee storage permission RLS correction', () => {
  it('uses uwm_has_permission for storage connection SELECT policies', async () => {
    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0121_employee_storage_permission_rls_correction.sql'),
      'utf8',
    );

    expect(sql).toContain('organization_storage_connections_documents_read_select');
    expect(sql).toContain('storage_folder_mappings_documents_read_select');
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*has_org_permission/);
    expect(sql.match(/uwm_has_permission\(organization_id, 'documents\.read'\)/g)).toHaveLength(2);
  });

  it('does not broaden write access or touch credentials', async () => {
    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0121_employee_storage_permission_rls_correction.sql'),
      'utf8',
    );

    expect(sql).not.toMatch(/\bINSERT\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toContain('storage_connection_credential_refs');
    expect(sql).not.toContain('service_role');
  });
});
