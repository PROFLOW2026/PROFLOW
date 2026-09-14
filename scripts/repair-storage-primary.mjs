/**
 * Repair storage primary flags for known broken states.
 * Run: node scripts/repair-storage-primary.mjs
 */

import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const OWNER_ORG = '7dec19cf-ef7a-4f62-a110-615da62f3823';
const OWNER_CONNECTION = 'ee41c00b-436f-4772-bc09-c173c7f5d9fd';
const LEGACY_ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function inspectOrg(orgId) {
  const connections = await sql`
    SELECT id, status, is_primary, root_folder_external_id, external_account_email, connected_at
    FROM organization_storage_connections
    WHERE organization_id = ${orgId}::uuid
    ORDER BY provider
  `;
  const mappings = await sql`
    SELECT connection_id, COUNT(*)::int AS c
    FROM storage_folder_mappings
    WHERE connection_id IN (
      SELECT id FROM organization_storage_connections WHERE organization_id = ${orgId}::uuid
    )
    GROUP BY connection_id
  `;
  return { connections, mappings };
}

async function repairOwnerOrg() {
  const before = await inspectOrg(OWNER_ORG);
  await sql`
    UPDATE organization_storage_connections
    SET is_primary = false, updated_at = NOW()
    WHERE organization_id = ${OWNER_ORG}::uuid AND is_primary = true
  `;
  await sql`
    UPDATE organization_storage_connections
    SET is_primary = true, updated_at = NOW()
    WHERE id = ${OWNER_CONNECTION}::uuid
      AND organization_id = ${OWNER_ORG}::uuid
      AND status = 'connected'
      AND root_folder_external_id IS NOT NULL
  `;
  const after = await inspectOrg(OWNER_ORG);
  return { before, after };
}

async function repairLegacyOrgE2eResidue() {
  const before = await inspectOrg(LEGACY_ORG);
  const [brokenPrimary] = await sql`
    SELECT c.id, c.status, c.is_primary, c.root_folder_external_id, c.connected_at,
           (SELECT COUNT(*)::int FROM storage_folder_mappings m WHERE m.connection_id = c.id) AS mapping_count,
           (SELECT COUNT(*)::int FROM app.storage_connection_credential_refs r WHERE r.connection_id = c.id) AS credential_count
    FROM organization_storage_connections c
    WHERE c.organization_id = ${LEGACY_ORG}::uuid
      AND c.provider = 'onedrive'
      AND c.is_primary = true
      AND c.status = 'connected'
      AND c.root_folder_external_id IS NULL
    LIMIT 1
  `;

  if (!brokenPrimary) {
    return { before, after: before, action: 'none — no broken primary residue found' };
  }

  // E2E/OAuth test residue: primary flag set but root never provisioned, no folder mappings.
  if (brokenPrimary.mapping_count > 0) {
    return {
      before,
      after: before,
      action: 'skipped — broken primary has folder mappings (not safe to auto-clean)',
      brokenPrimary,
    };
  }

  await sql`
    UPDATE organization_storage_connections
    SET is_primary = false,
        status = 'reconnect_required',
        last_error = 'root_never_provisioned',
        updated_at = NOW()
    WHERE id = ${brokenPrimary.id}::uuid
  `;

  const after = await inspectOrg(LEGACY_ORG);
  return {
    before,
    after,
    action: 'demoted broken E2E OneDrive primary (no root, no mappings)',
    brokenPrimary,
  };
}

const ownerRepair = await repairOwnerOrg();
const legacyRepair = await repairLegacyOrgE2eResidue();

console.log(JSON.stringify({ ownerRepair, legacyRepair }, null, 2));
await sql.end();
