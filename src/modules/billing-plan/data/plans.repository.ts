import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import {
  projectBillingPlans,
  projects,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { BillingPlanStatus, ProjectBillingPlanRecord } from '../domain/types';

function mapPlan(row: typeof projectBillingPlans.$inferSelect): ProjectBillingPlanRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    contractId: row.contractId,
    templateId: row.templateId ?? null,
    name: row.name,
    status: row.status as BillingPlanStatus,
    currency: row.currency,
    defaultRetentionPercent: row.defaultRetentionPercent ?? null,
    notes: row.notes ?? null,
    createdByUserId: row.createdByUserId ?? null,
    activatedAt: row.activatedAt ?? null,
    completedAt: row.completedAt ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findProjectCurrency(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{ currency: string | null } | null> {
  const [row] = await db
    .select({ currency: projects.currency })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.id, projectId),
        isNull(projects.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findPlanById(
  db: DbExecutor,
  organizationId: string,
  planId: string,
): Promise<ProjectBillingPlanRecord | null> {
  const [row] = await db
    .select()
    .from(projectBillingPlans)
    .where(
      and(
        eq(projectBillingPlans.organizationId, organizationId),
        eq(projectBillingPlans.id, planId),
      ),
    )
    .limit(1);
  return row ? mapPlan(row) : null;
}

export async function findActivePlanForProjectContract(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  contractId: string,
): Promise<ProjectBillingPlanRecord | null> {
  const [row] = await db
    .select()
    .from(projectBillingPlans)
    .where(
      and(
        eq(projectBillingPlans.organizationId, organizationId),
        eq(projectBillingPlans.projectId, projectId),
        eq(projectBillingPlans.contractId, contractId),
        eq(projectBillingPlans.status, 'active'),
      ),
    )
    .limit(1);
  return row ? mapPlan(row) : null;
}

export async function listPlansForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  options?: { contractId?: string; includeArchived?: boolean },
): Promise<ProjectBillingPlanRecord[]> {
  const conditions = [
    eq(projectBillingPlans.organizationId, organizationId),
    eq(projectBillingPlans.projectId, projectId),
  ];
  if (options?.contractId) {
    conditions.push(eq(projectBillingPlans.contractId, options.contractId));
  }
  if (!options?.includeArchived) {
    conditions.push(ne(projectBillingPlans.status, 'archived'));
  }

  const rows = await db
    .select()
    .from(projectBillingPlans)
    .where(and(...conditions))
    .orderBy(desc(projectBillingPlans.createdAt));

  return rows.map(mapPlan);
}

export async function insertPlan(
  db: DbExecutor,
  row: {
    organizationId: string;
    projectId: string;
    contractId: string;
    templateId?: string | null;
    name: string;
    status: BillingPlanStatus;
    currency: string;
    defaultRetentionPercent?: string | null;
    notes?: string | null;
    createdByUserId?: string | null;
    activatedAt?: Date | null;
  },
): Promise<ProjectBillingPlanRecord> {
  const [inserted] = await db
    .insert(projectBillingPlans)
    .values({
      organizationId: row.organizationId,
      projectId: row.projectId,
      contractId: row.contractId,
      templateId: row.templateId ?? null,
      name: row.name,
      status: row.status,
      currency: row.currency,
      defaultRetentionPercent: row.defaultRetentionPercent ?? null,
      notes: row.notes ?? null,
      createdByUserId: row.createdByUserId ?? null,
      activatedAt: row.activatedAt ?? null,
    })
    .returning();

  return mapPlan(inserted!);
}

export async function updatePlan(
  db: DbExecutor,
  organizationId: string,
  planId: string,
  patch: Partial<{
    name: string;
    status: BillingPlanStatus;
    defaultRetentionPercent: string | null;
    notes: string | null;
    templateId: string | null;
    activatedAt: Date | null;
    completedAt: Date | null;
    archivedAt: Date | null;
  }>,
): Promise<ProjectBillingPlanRecord | null> {
  const [updated] = await db
    .update(projectBillingPlans)
    .set({
      ...patch,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(projectBillingPlans.organizationId, organizationId),
        eq(projectBillingPlans.id, planId),
      ),
    )
    .returning();

  return updated ? mapPlan(updated) : null;
}

export async function deletePlanById(
  db: DbExecutor,
  organizationId: string,
  planId: string,
): Promise<void> {
  await db
    .delete(projectBillingPlans)
    .where(
      and(
        eq(projectBillingPlans.organizationId, organizationId),
        eq(projectBillingPlans.id, planId),
      ),
    );
}

export async function listPlansOrdered(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectBillingPlanRecord[]> {
  const rows = await db
    .select()
    .from(projectBillingPlans)
    .where(
      and(
        eq(projectBillingPlans.organizationId, organizationId),
        eq(projectBillingPlans.projectId, projectId),
      ),
    )
    .orderBy(asc(projectBillingPlans.createdAt));
  return rows.map(mapPlan);
}
