import { and, asc, eq, isNull } from 'drizzle-orm';
import { workPackages } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { WorkPackageRecord } from '../domain/types';

function mapWorkPackage(row: typeof workPackages.$inferSelect): WorkPackageRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    name: row.name,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    description: row.description,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertWorkPackage(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    name: string;
    isDefault?: boolean;
    sortOrder?: number;
    description?: string | null;
  },
): Promise<WorkPackageRecord> {
  const [row] = await db
    .insert(workPackages)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      name: input.name,
      isDefault: input.isDefault ?? false,
      sortOrder: input.sortOrder ?? 0,
      description: input.description ?? null,
    })
    .returning();

  return mapWorkPackage(row!);
}

export async function listWorkPackagesByProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  options: { includeArchived?: boolean } = {},
): Promise<WorkPackageRecord[]> {
  const conditions = [
    eq(workPackages.organizationId, organizationId),
    eq(workPackages.projectId, projectId),
  ];

  if (!options.includeArchived) {
    conditions.push(isNull(workPackages.archivedAt));
  }

  const rows = await db
    .select()
    .from(workPackages)
    .where(and(...conditions))
    .orderBy(asc(workPackages.sortOrder), asc(workPackages.name));

  return rows.map(mapWorkPackage);
}

export async function findWorkPackageById(
  db: DbExecutor,
  organizationId: string,
  workPackageId: string,
): Promise<WorkPackageRecord | null> {
  const [row] = await db
    .select()
    .from(workPackages)
    .where(and(eq(workPackages.id, workPackageId), eq(workPackages.organizationId, organizationId)))
    .limit(1);

  return row ? mapWorkPackage(row) : null;
}

export async function findDefaultWorkPackage(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<WorkPackageRecord | null> {
  const [row] = await db
    .select()
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        eq(workPackages.isDefault, true),
        isNull(workPackages.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapWorkPackage(row) : null;
}

export async function updateWorkPackageById(
  db: DbExecutor,
  organizationId: string,
  workPackageId: string,
  patch: Partial<{
    name: string;
    sortOrder: number;
    description: string | null;
    archivedAt: Date | null;
  }>,
): Promise<WorkPackageRecord | null> {
  const [row] = await db
    .update(workPackages)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(workPackages.id, workPackageId), eq(workPackages.organizationId, organizationId)))
    .returning();

  return row ? mapWorkPackage(row) : null;
}

export async function nextWorkPackageSortOrder(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<number> {
  const packages = await listWorkPackagesByProject(db, organizationId, projectId);
  if (packages.length === 0) return 0;
  return Math.max(...packages.map((pkg) => pkg.sortOrder)) + 1;
}
