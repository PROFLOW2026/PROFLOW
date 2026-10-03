import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { projectLocations, subcontractAgreements, vendors } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

/** Contractor (vendor + agreement) on a project. Operational fields only - never contract money. */
export interface ProjectContractorOption {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly agreementId: string;
  readonly agreementTitle: string;
}

export async function listProjectContractors(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectContractorOption[]> {
  return db
    .select({
      vendorId: subcontractAgreements.vendorId,
      vendorName: vendors.name,
      agreementId: subcontractAgreements.id,
      agreementTitle: subcontractAgreements.title,
    })
    .from(subcontractAgreements)
    .innerJoin(
      vendors,
      and(eq(vendors.id, subcontractAgreements.vendorId), eq(vendors.organizationId, subcontractAgreements.organizationId)),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.projectId, projectId),
        ne(subcontractAgreements.status, 'cancelled'),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .orderBy(asc(vendors.name), asc(subcontractAgreements.title))
    .limit(500);
}

/** Vendor display names for ids (internal readers only). */
export async function vendorNameMap(
  db: DbExecutor,
  organizationId: string,
  vendorIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(vendorIds)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), inArray(vendors.id, unique)));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export interface ProjectLocationOption {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
}

export async function listProjectLocationOptions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectLocationOption[]> {
  return db
    .select({ id: projectLocations.id, name: projectLocations.name, code: projectLocations.code })
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
    .limit(500);
}
