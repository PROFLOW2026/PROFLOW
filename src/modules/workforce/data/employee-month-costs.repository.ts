import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { employeeMonthCosts } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export type EmployeeMonthCostRow = typeof employeeMonthCosts.$inferSelect;

export type EmployeeMonthCostStatus = 'draft' | 'applied' | 'closed' | 'superseded';
export type KnownQuality = 'estimated' | 'actual';
export type MonthCostSource = 'manual' | 'import' | 'compensation_derived' | 'adjustment';
export type RecognitionSource = 'time_snapshot' | 'monthly_allocated';

export async function findEmployeeMonthCostByEmployeeMonth(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  yearMonth: string,
): Promise<EmployeeMonthCostRow | null> {
  const [row] = await db
    .select()
    .from(employeeMonthCosts)
    .where(
      and(
        eq(employeeMonthCosts.organizationId, organizationId),
        eq(employeeMonthCosts.employeeId, employeeId),
        eq(employeeMonthCosts.yearMonth, yearMonth),
        inArray(employeeMonthCosts.status, ['draft', 'applied', 'closed']),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findEmployeeMonthCostById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<EmployeeMonthCostRow | null> {
  const [row] = await db
    .select()
    .from(employeeMonthCosts)
    .where(and(eq(employeeMonthCosts.id, id), eq(employeeMonthCosts.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listEmployeeMonthCostsForEmployee(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<EmployeeMonthCostRow[]> {
  return db
    .select()
    .from(employeeMonthCosts)
    .where(
      and(
        eq(employeeMonthCosts.organizationId, organizationId),
        eq(employeeMonthCosts.employeeId, employeeId),
        ne(employeeMonthCosts.status, 'superseded'),
      ),
    )
    .orderBy(desc(employeeMonthCosts.yearMonth));
}

export async function insertEmployeeMonthCostDraft(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    yearMonth: string;
    currency: string;
    estimatedAmount: string | null;
    actualAmount: string | null;
    knownAmount: string;
    knownQuality: KnownQuality;
    source?: MonthCostSource;
    notes?: string | null;
  },
): Promise<EmployeeMonthCostRow> {
  const [row] = await db
    .insert(employeeMonthCosts)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      yearMonth: input.yearMonth,
      currency: input.currency,
      estimatedAmount: input.estimatedAmount,
      actualAmount: input.actualAmount,
      knownAmount: input.knownAmount,
      knownQuality: input.knownQuality,
      source: input.source ?? 'manual',
      recognitionSource: 'time_snapshot',
      status: 'draft',
      notes: input.notes ?? null,
    })
    .returning();
  return row!;
}

export async function updateEmployeeMonthCostDraft(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: {
    estimatedAmount: string | null;
    actualAmount: string | null;
    knownAmount: string;
    knownQuality: KnownQuality;
    notes?: string | null;
  },
): Promise<EmployeeMonthCostRow | null> {
  const [row] = await db
    .update(employeeMonthCosts)
    .set({
      estimatedAmount: patch.estimatedAmount,
      actualAmount: patch.actualAmount,
      knownAmount: patch.knownAmount,
      knownQuality: patch.knownQuality,
      notes: patch.notes === undefined ? undefined : patch.notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(employeeMonthCosts.id, id),
        eq(employeeMonthCosts.organizationId, organizationId),
        eq(employeeMonthCosts.status, 'draft'),
      ),
    )
    .returning();
  return row ?? null;
}

/** Close an applied month (locks further money edits via immutability). */
export async function closeEmployeeMonthCost(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<EmployeeMonthCostRow | null> {
  const [row] = await db
    .update(employeeMonthCosts)
    .set({
      status: 'closed',
      lockedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(employeeMonthCosts.id, id),
        eq(employeeMonthCosts.organizationId, organizationId),
        eq(employeeMonthCosts.status, 'applied'),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Open-month rewrite path when an applied row cannot be demoted via run supersede
 * (orphan applied / draft-run inconsistency). Allowed: applied → superseded.
 */
export async function supersedeEmployeeMonthCost(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<EmployeeMonthCostRow | null> {
  const [row] = await db
    .update(employeeMonthCosts)
    .set({
      status: 'superseded',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(employeeMonthCosts.id, id),
        eq(employeeMonthCosts.organizationId, organizationId),
        eq(employeeMonthCosts.status, 'applied'),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listActiveMonthCostsByYearMonthAsc(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<EmployeeMonthCostRow[]> {
  return db
    .select()
    .from(employeeMonthCosts)
    .where(
      and(
        eq(employeeMonthCosts.organizationId, organizationId),
        eq(employeeMonthCosts.employeeId, employeeId),
        inArray(employeeMonthCosts.status, ['draft', 'applied', 'closed']),
      ),
    )
    .orderBy(asc(employeeMonthCosts.yearMonth));
}
