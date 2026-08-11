import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
  projectBudgetLines,
  projectBudgetRevisions,
  projectBudgets,
  projects,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  BudgetLineType,
  BudgetStatus,
  ProjectBudgetLineRecord,
  ProjectBudgetRecord,
  ProjectBudgetRevisionRecord,
} from '../domain/types';

function mapBudget(row: typeof projectBudgets.$inferSelect): ProjectBudgetRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    name: row.name,
    status: row.status as BudgetStatus,
    currency: row.currency,
    totalBudgetAmount: row.totalBudgetAmount,
    currentRevisionNumber: row.currentRevisionNumber,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLine(row: typeof projectBudgetLines.$inferSelect): ProjectBudgetLineRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    budgetId: row.budgetId,
    revisionNumber: row.revisionNumber,
    lineType: row.lineType as BudgetLineType,
    categoryKey: row.categoryKey,
    workPackageId: row.workPackageId,
    disciplineKey: row.disciplineKey,
    costCode: row.costCode,
    label: row.label,
    budgetAmount: row.budgetAmount,
    etcAmount: row.etcAmount,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRevision(
  row: typeof projectBudgetRevisions.$inferSelect,
): ProjectBudgetRevisionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    budgetId: row.budgetId,
    revisionNumber: row.revisionNumber,
    reason: row.reason,
    snapshotTotalAmount: row.snapshotTotalAmount,
    createdByUserId: row.createdByUserId,
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

export async function findActiveBudgetForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectBudgetRecord | null> {
  const [row] = await db
    .select()
    .from(projectBudgets)
    .where(
      and(
        eq(projectBudgets.organizationId, organizationId),
        eq(projectBudgets.projectId, projectId),
        eq(projectBudgets.status, 'active'),
        isNull(projectBudgets.archivedAt),
      ),
    )
    .orderBy(desc(projectBudgets.createdAt))
    .limit(1);
  return row ? mapBudget(row) : null;
}

export async function findBudgetById(
  db: DbExecutor,
  organizationId: string,
  budgetId: string,
): Promise<ProjectBudgetRecord | null> {
  const [row] = await db
    .select()
    .from(projectBudgets)
    .where(
      and(eq(projectBudgets.organizationId, organizationId), eq(projectBudgets.id, budgetId)),
    )
    .limit(1);
  return row ? mapBudget(row) : null;
}

export async function listBudgetLinesForRevision(
  db: DbExecutor,
  organizationId: string,
  budgetId: string,
  revisionNumber: number,
): Promise<ProjectBudgetLineRecord[]> {
  const rows = await db
    .select()
    .from(projectBudgetLines)
    .where(
      and(
        eq(projectBudgetLines.organizationId, organizationId),
        eq(projectBudgetLines.budgetId, budgetId),
        eq(projectBudgetLines.revisionNumber, revisionNumber),
      ),
    )
    .orderBy(asc(projectBudgetLines.sortOrder), asc(projectBudgetLines.createdAt));
  return rows.map(mapLine);
}

export async function listBudgetRevisions(
  db: DbExecutor,
  organizationId: string,
  budgetId: string,
): Promise<ProjectBudgetRevisionRecord[]> {
  const rows = await db
    .select()
    .from(projectBudgetRevisions)
    .where(
      and(
        eq(projectBudgetRevisions.organizationId, organizationId),
        eq(projectBudgetRevisions.budgetId, budgetId),
      ),
    )
    .orderBy(desc(projectBudgetRevisions.revisionNumber));
  return rows.map(mapRevision);
}

export async function insertProjectBudget(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    name: string;
    status: BudgetStatus;
    currency: string;
    totalBudgetAmount: string | null;
    currentRevisionNumber: number;
  },
): Promise<ProjectBudgetRecord> {
  const [row] = await db
    .insert(projectBudgets)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      name: input.name,
      status: input.status,
      currency: input.currency,
      totalBudgetAmount: input.totalBudgetAmount,
      currentRevisionNumber: input.currentRevisionNumber,
    })
    .returning();
  return mapBudget(row!);
}

export async function insertBudgetRevision(
  db: DbExecutor,
  input: {
    organizationId: string;
    budgetId: string;
    revisionNumber: number;
    reason: string;
    snapshotTotalAmount: string | null;
    createdByUserId: string | null;
  },
): Promise<ProjectBudgetRevisionRecord> {
  const [row] = await db
    .insert(projectBudgetRevisions)
    .values({
      organizationId: input.organizationId,
      budgetId: input.budgetId,
      revisionNumber: input.revisionNumber,
      reason: input.reason,
      snapshotTotalAmount: input.snapshotTotalAmount,
      createdByUserId: input.createdByUserId,
    })
    .returning();
  return mapRevision(row!);
}

export async function insertBudgetLines(
  db: DbExecutor,
  organizationId: string,
  budgetId: string,
  revisionNumber: number,
  lines: readonly {
    lineType: BudgetLineType;
    categoryKey?: string | null;
    workPackageId?: string | null;
    disciplineKey?: string | null;
    costCode?: string | null;
    label: string;
    budgetAmount: string;
    etcAmount?: string | null;
    sortOrder?: number;
  }[],
): Promise<ProjectBudgetLineRecord[]> {
  if (lines.length === 0) return [];

  const rows = await db
    .insert(projectBudgetLines)
    .values(
      lines.map((line, index) => ({
        organizationId,
        budgetId,
        revisionNumber,
        lineType: line.lineType,
        categoryKey: line.categoryKey ?? null,
        workPackageId: line.workPackageId ?? null,
        disciplineKey: line.disciplineKey ?? null,
        costCode: line.costCode ?? null,
        label: line.label,
        budgetAmount: line.budgetAmount,
        etcAmount: line.etcAmount ?? null,
        sortOrder: line.sortOrder ?? index,
      })),
    )
    .returning();

  return rows.map(mapLine);
}

export async function updateBudgetTotals(
  db: DbExecutor,
  organizationId: string,
  budgetId: string,
  patch: {
    totalBudgetAmount: string | null;
    currentRevisionNumber: number;
    name?: string;
  },
): Promise<ProjectBudgetRecord | null> {
  const [row] = await db
    .update(projectBudgets)
    .set({
      totalBudgetAmount: patch.totalBudgetAmount,
      currentRevisionNumber: patch.currentRevisionNumber,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(projectBudgets.organizationId, organizationId), eq(projectBudgets.id, budgetId)),
    )
    .returning();
  return row ? mapBudget(row) : null;
}
