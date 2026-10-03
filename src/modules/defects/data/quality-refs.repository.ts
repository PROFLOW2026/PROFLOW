import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  projectLocations,
  projectMilestones,
  subcontractWorkLines,
  workPackages,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { ValidationError } from '@/shared/errors';

/**
 * Validates the optional references of an inspection / defect against ONE project and resolves the
 * responsible contractor. Shared by the inspections and defects modules (defects owns it so the
 * dependency direction stays inspections -> defects).
 */

export interface QualityRefsInput {
  readonly locationId?: string | null;
  readonly vendorId?: string | null;
  readonly subcontractAgreementId?: string | null;
  readonly workLineId?: string | null;
  readonly workPackageId?: string | null;
  readonly milestoneId?: string | null;
}

export interface ResolvedQualityRefs {
  readonly locationId: string | null;
  readonly vendorId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly workLineId: string | null;
  readonly workPackageId: string | null;
  readonly milestoneId: string | null;
}

export interface ProjectContractorRow {
  readonly agreementId: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly agreementTitle: string;
  readonly agreementStatus: string;
}

function sqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

/**
 * Contractors (agreements + vendor names, no money) on one project, through the definer function
 * `app.quality_project_contractors` (migration 0164). Empty when the caller lacks contractor.view /
 * quality.manage / defects.manage on the project.
 */
export async function listProjectContractors(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectContractorRow[]> {
  const rows = sqlRows<{
    agreement_id: string;
    vendor_id: string;
    vendor_name: string;
    agreement_title: string;
    agreement_status: string;
  }>(await db.execute(sql`select * from app.quality_project_contractors(${organizationId}::uuid, ${projectId}::uuid)`));
  return rows.map((row) => ({
    agreementId: row.agreement_id,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    agreementTitle: row.agreement_title,
    agreementStatus: row.agreement_status,
  }));
}

/** vendorId -> display name for one project. */
export async function projectVendorNames(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const row of await listProjectContractors(db, organizationId, projectId)) names.set(row.vendorId, row.vendorName);
  return names;
}

function invalid(path: string): never {
  throw new ValidationError([{ path, message: 'Invalid reference', messageKey: 'defects.errors.invalidReference' }]);
}

export async function resolveQualityRefs(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  input: QualityRefsInput,
): Promise<ResolvedQualityRefs> {
  let vendorId = input.vendorId ?? null;
  const agreementId = input.subcontractAgreementId ?? null;
  const workLineId = input.workLineId ?? null;

  if (input.locationId) {
    const [row] = await db
      .select({ id: projectLocations.id })
      .from(projectLocations)
      .where(
        and(
          eq(projectLocations.organizationId, organizationId),
          eq(projectLocations.projectId, projectId),
          eq(projectLocations.id, input.locationId),
          isNull(projectLocations.archivedAt),
        ),
      )
      .limit(1);
    if (!row) invalid('locationId');
  }

  if (agreementId || vendorId) {
    const contractors = await listProjectContractors(db, organizationId, projectId);
    if (agreementId) {
      const row = contractors.find((candidate) => candidate.agreementId === agreementId);
      if (!row) invalid('subcontractAgreementId');
      if (vendorId && vendorId !== row.vendorId) invalid('vendorId');
      vendorId = row.vendorId;
    } else if (!contractors.some((candidate) => candidate.vendorId === vendorId)) {
      invalid('vendorId');
    }
  }

  if (workLineId) {
    if (!agreementId) invalid('workLineId');
    const [row] = await db
      .select({ id: subcontractWorkLines.id })
      .from(subcontractWorkLines)
      .where(
        and(
          eq(subcontractWorkLines.organizationId, organizationId),
          eq(subcontractWorkLines.agreementId, agreementId),
          eq(subcontractWorkLines.id, workLineId),
        ),
      )
      .limit(1);
    if (!row) invalid('workLineId');
  }

  if (input.workPackageId) {
    const [row] = await db
      .select({ id: workPackages.id })
      .from(workPackages)
      .where(
        and(
          eq(workPackages.organizationId, organizationId),
          eq(workPackages.projectId, projectId),
          eq(workPackages.id, input.workPackageId),
        ),
      )
      .limit(1);
    if (!row) invalid('workPackageId');
  }

  if (input.milestoneId) {
    const [row] = await db
      .select({ id: projectMilestones.id })
      .from(projectMilestones)
      .where(
        and(
          eq(projectMilestones.organizationId, organizationId),
          eq(projectMilestones.projectId, projectId),
          eq(projectMilestones.id, input.milestoneId),
        ),
      )
      .limit(1);
    if (!row) invalid('milestoneId');
  }

  return {
    locationId: input.locationId ?? null,
    vendorId,
    subcontractAgreementId: agreementId,
    workLineId,
    workPackageId: input.workPackageId ?? null,
    milestoneId: input.milestoneId ?? null,
  };
}

export interface QualityFormOptions {
  readonly locations: readonly { id: string; name: string; code: string | null; parentId: string | null; depth: number }[];
  readonly agreements: readonly { id: string; title: string; vendorId: string; vendorName: string }[];
  readonly workLines: readonly { id: string; agreementId: string; code: string | null; description: string }[];
  readonly workPackages: readonly { id: string; name: string }[];
  readonly milestones: readonly { id: string; name: string }[];
}

/** Flattens the adjacency list into a depth-first ordered list (for indented selects). */
export function flattenLocationTree<T extends { id: string; parentId: string | null; sortOrder: number; name: string }>(
  rows: readonly T[],
): (T & { depth: number })[] {
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    const key = row.parentId && rows.some((candidate) => candidate.id === row.parentId) ? row.parentId : null;
    const list = children.get(key) ?? [];
    list.push(row);
    children.set(key, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  const result: (T & { depth: number })[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const row of children.get(parent) ?? []) {
      result.push({ ...row, depth });
      if (depth < 12) visit(row.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

/** Operational option lists for inspection / defect forms (no money). */
export async function loadQualityFormOptions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<QualityFormOptions> {
  const locationRows = await db
    .select({
      id: projectLocations.id,
      name: projectLocations.name,
      code: projectLocations.code,
      parentId: projectLocations.parentId,
      sortOrder: projectLocations.sortOrder,
    })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        isNull(projectLocations.archivedAt),
        eq(projectLocations.isActive, true),
      ),
    );

  const agreements = (await listProjectContractors(db, organizationId, projectId))
    .filter((row) => row.agreementStatus !== 'cancelled')
    .map((row) => ({
      id: row.agreementId,
      title: row.agreementTitle,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
    }));

  const workLines = await db
    .select({
      id: subcontractWorkLines.id,
      agreementId: subcontractWorkLines.agreementId,
      code: subcontractWorkLines.code,
      description: subcontractWorkLines.description,
    })
    .from(subcontractWorkLines)
    .where(
      and(
        eq(subcontractWorkLines.organizationId, organizationId),
        eq(subcontractWorkLines.projectId, projectId),
        isNull(subcontractWorkLines.archivedAt),
        eq(subcontractWorkLines.status, 'active'),
      ),
    )
    .orderBy(asc(subcontractWorkLines.sortOrder))
    .limit(500);

  const packages = await db
    .select({ id: workPackages.id, name: workPackages.name })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        isNull(workPackages.archivedAt),
      ),
    )
    .orderBy(asc(workPackages.sortOrder), asc(workPackages.name));

  const milestones = await db
    .select({ id: projectMilestones.id, name: projectMilestones.name })
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.organizationId, organizationId),
        eq(projectMilestones.projectId, projectId),
        isNull(projectMilestones.archivedAt),
      ),
    )
    .orderBy(asc(projectMilestones.sortOrder));

  return {
    locations: flattenLocationTree(locationRows).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      parentId: row.parentId,
      depth: row.depth,
    })),
    agreements,
    workLines,
    workPackages: packages,
    milestones,
  };
}
