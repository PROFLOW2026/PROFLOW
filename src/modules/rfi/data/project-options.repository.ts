import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { projectLocations, workPackages } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Project-scoped pick lists shared by RFI + submittal forms. Operational columns only (never agreement
 * money). Runs with the caller's RLS-bound executor, so rows the caller cannot see simply do not appear.
 */

export interface AgreementOption {
  readonly id: string;
  readonly title: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  /** false = archived / cancelled: still labelled, never offered for new records. */
  readonly selectable: boolean;
}

/**
 * Contractor identity on a project via `app.rfi_submittal_project_contractors` (0163): agreement title +
 * vendor name only, for team members with contractor.view / rfi.manage / submittal.manage. Never money.
 */
export async function listProjectContractors(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<AgreementOption[]> {
  const result = await db.execute(
    sql`select agreement_id, vendor_id, agreement_title, vendor_name, is_selectable
        from app.rfi_submittal_project_contractors(${organizationId}::uuid, ${projectId}::uuid)`,
  );
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as {
    agreement_id: string;
    vendor_id: string;
    agreement_title: string;
    vendor_name: string | null;
    is_selectable: boolean;
  }[];
  return rows.map((row) => ({
    id: row.agreement_id,
    title: row.agreement_title,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    selectable: row.is_selectable,
  }));
}

export async function listProjectAgreementOptions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<AgreementOption[]> {
  return (await listProjectContractors(db, organizationId, projectId)).filter((option) => option.selectable);
}

export async function findProjectAgreement(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  agreementId: string,
): Promise<{ id: string; vendorId: string } | null> {
  const match = (await listProjectAgreementOptions(db, organizationId, projectId)).find(
    (option) => option.id === agreementId,
  );
  return match ? { id: match.id, vendorId: match.vendorId } : null;
}

/** vendorId -> display name, for labelling rows whose vendor the caller cannot read directly. */
export function vendorNameMap(options: readonly AgreementOption[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const option of options) {
    if (option.vendorName && !names.has(option.vendorId)) names.set(option.vendorId, option.vendorName);
  }
  return names;
}

export interface LocationOption {
  readonly id: string;
  /** Full path, e.g. "Building A / Floor 3 / Apt 12". */
  readonly label: string;
}

export async function listProjectLocationOptions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<LocationOption[]> {
  const rows = await db
    .select({
      id: projectLocations.id,
      parentId: projectLocations.parentId,
      name: projectLocations.name,
      code: projectLocations.code,
      sortOrder: projectLocations.sortOrder,
    })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        eq(projectLocations.isActive, true),
        isNull(projectLocations.archivedAt),
      ),
    )
    .orderBy(asc(projectLocations.sortOrder), asc(projectLocations.name))
    .limit(2000);
  return buildLocationOptions(rows);
}

/** Pure: depth-first ordering with path labels; orphans (parent hidden/archived) become roots. */
export function buildLocationOptions(
  rows: readonly { id: string; parentId: string | null; name: string; code: string | null }[],
): LocationOption[] {
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  const children = new Map<string | null, typeof rows[number][]>();
  for (const row of rows) {
    const parent = row.parentId && byId.has(row.parentId) ? row.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(row);
    children.set(parent, list);
  }
  const result: LocationOption[] = [];
  const visit = (parent: string | null, prefix: string, depth: number) => {
    if (depth > 32) return;
    for (const row of children.get(parent) ?? []) {
      const own = row.code ? `${row.name} (${row.code})` : row.name;
      const label = prefix ? `${prefix} / ${own}` : own;
      result.push({ id: row.id, label });
      visit(row.id, label, depth + 1);
    }
  };
  visit(null, '', 0);
  return result;
}

export interface WorkPackageOption {
  readonly id: string;
  readonly name: string;
}

export async function listProjectWorkPackageOptions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<WorkPackageOption[]> {
  return db
    .select({ id: workPackages.id, name: workPackages.name })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        isNull(workPackages.archivedAt),
      ),
    )
    .orderBy(asc(workPackages.sortOrder), asc(workPackages.name))
    .limit(500);
}
