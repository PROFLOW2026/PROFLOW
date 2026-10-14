import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import type { ConnectedProjectMappingView, ConnectedProjectStatus } from '../domain/types';

type MappingRow = {
  id: string;
  contractor_organization_id: string;
  contractor_project_id: string;
  developer_organization_id: string;
  developer_project_id: string;
  subcontract_agreement_id: string;
  vendor_id: string;
  status: string;
  developer_organization_name: string | null;
  developer_project_name: string | null;
};

function rowToView(row: MappingRow): ConnectedProjectMappingView {
  return {
    id: row.id,
    contractorOrganizationId: row.contractor_organization_id,
    contractorProjectId: row.contractor_project_id,
    developerOrganizationId: row.developer_organization_id,
    developerProjectId: row.developer_project_id,
    subcontractAgreementId: row.subcontract_agreement_id,
    vendorId: row.vendor_id,
    status: row.status as ConnectedProjectStatus,
    developerOrganizationName: row.developer_organization_name,
    developerProjectName: row.developer_project_name,
  };
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === '42P01';
}

/**
 * Loads the active-ish mapping for a contractor org project.
 * Returns null when the project is not connected or the schema migration is not applied yet.
 *
 * Must run on an executor that can read developer agreement rows (admin / service role).
 */
export async function findConnectedProjectMappingForContractorProject(
  db: DbExecutor,
  input: { readonly contractorOrganizationId: string; readonly contractorProjectId: string },
): Promise<ConnectedProjectMappingView | null> {
  try {
    const result = await db.execute(sql`
      select
        m.id,
        m.contractor_organization_id,
        m.contractor_project_id,
        m.developer_organization_id,
        m.developer_project_id,
        m.subcontract_agreement_id,
        sa.vendor_id,
        m.status,
        dev_org.name as developer_organization_name,
        dev_proj.name as developer_project_name
      from connected_project_mappings m
      inner join subcontract_agreements_store sa
        on sa.id = m.subcontract_agreement_id
        and sa.organization_id = m.developer_organization_id
      left join organizations dev_org
        on dev_org.id = m.developer_organization_id
      left join projects dev_proj
        on dev_proj.id = m.developer_project_id
        and dev_proj.organization_id = m.developer_organization_id
      where m.contractor_organization_id = ${input.contractorOrganizationId}
        and m.contractor_project_id = ${input.contractorProjectId}
        and m.status in ('pending', 'provisioning', 'active')
        and m.revoked_at is null
      limit 1
    `);
    const rows = (Array.isArray(result) ? result : (result as { rows: MappingRow[] }).rows) as MappingRow[];
    const row = rows[0];
    return row ? rowToView(row) : null;
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn('[connected-projects] schema-missing: connected_project_mappings not applied');
      return null;
    }
    throw error;
  }
}
