import { and, asc, eq, isNull } from 'drizzle-orm';
import { phases, projects, workPackages } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function findProjectById(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{ id: string; name: string; currency: string | null } | null> {
  const [row] = await db
    .select({ id: projects.id, name: projects.name, currency: projects.currency })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .limit(1);

  return row ?? null;
}

export async function listActiveProjects(
  db: DbExecutor,
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        isNull(projects.archivedAt),
        eq(projects.status, 'active'),
      ),
    )
    .orderBy(asc(projects.name));

  return rows;
}

export async function findDefaultWorkPackage(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: workPackages.id, name: workPackages.name })
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

  return row ?? null;
}

export async function findWorkPackageById(
  db: DbExecutor,
  organizationId: string,
  workPackageId: string,
): Promise<{ id: string; projectId: string; name: string } | null> {
  const [row] = await db
    .select({ id: workPackages.id, projectId: workPackages.projectId, name: workPackages.name })
    .from(workPackages)
    .where(
      and(eq(workPackages.id, workPackageId), eq(workPackages.organizationId, organizationId), isNull(workPackages.archivedAt)),
    )
    .limit(1);

  return row ?? null;
}

export async function listWorkPackagesByProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{ id: string; name: string; isDefault: boolean }[]> {
  const rows = await db
    .select({ id: workPackages.id, name: workPackages.name, isDefault: workPackages.isDefault })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        isNull(workPackages.archivedAt),
      ),
    )
    .orderBy(asc(workPackages.sortOrder), asc(workPackages.name));

  return rows;
}

export async function findPhaseById(
  db: DbExecutor,
  organizationId: string,
  phaseId: string,
): Promise<{ id: string; projectId: string; workPackageId: string; name: string } | null> {
  const [row] = await db
    .select({
      id: phases.id,
      projectId: phases.projectId,
      workPackageId: phases.workPackageId,
      name: phases.name,
    })
    .from(phases)
    .where(and(eq(phases.id, phaseId), eq(phases.organizationId, organizationId), isNull(phases.archivedAt)))
    .limit(1);

  return row ?? null;
}

export async function listPhasesByWorkPackage(
  db: DbExecutor,
  organizationId: string,
  workPackageId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: phases.id, name: phases.name })
    .from(phases)
    .where(
      and(eq(phases.organizationId, organizationId), eq(phases.workPackageId, workPackageId), isNull(phases.archivedAt)),
    )
    .orderBy(asc(phases.sortOrder), asc(phases.name));

  return rows;
}
