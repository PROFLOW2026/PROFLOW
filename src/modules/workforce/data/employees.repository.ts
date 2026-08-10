import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { employees } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { EmployeeListItem, EmployeeRecord, RateUnit } from '../domain/types';

function mapEmployee(row: typeof employees.$inferSelect): EmployeeRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status,
    userId: row.userId,
    employeeNumber: row.employeeNumber,
    jobTitle: row.jobTitle,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertEmployee(
  db: DbExecutor,
  input: {
    organizationId: string;
    name: string;
    status?: EmployeeRecord['status'];
    userId?: string | null;
    employeeNumber?: string | null;
    jobTitle?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<EmployeeRecord> {
  const [row] = await db
    .insert(employees)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      status: input.status ?? 'active',
      userId: input.userId ?? null,
      employeeNumber: input.employeeNumber ?? null,
      jobTitle: input.jobTitle ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapEmployee(row!);
}

export async function updateEmployeeById(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  patch: Partial<{
    name: string;
    status: EmployeeRecord['status'];
    userId: string | null;
    employeeNumber: string | null;
    jobTitle: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    archivedAt: Date | null;
  }>,
): Promise<EmployeeRecord | null> {
  const [row] = await db
    .update(employees)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
    .returning();

  return row ? mapEmployee(row) : null;
}

export async function findEmployeeById(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<EmployeeRecord | null> {
  const [row] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
    .limit(1);

  return row ? mapEmployee(row) : null;
}

export async function listEmployees(
  db: DbExecutor,
  organizationId: string,
  filters: {
    search?: string;
    includeArchived?: boolean;
    status?: EmployeeRecord['status'] | 'all';
    /** Org-timezone business date — must match detail (`todayInTimeZone`), never DB `current_date`. */
    asOfDate: string;
  },
): Promise<EmployeeListItem[]> {
  const conditions = [eq(employees.organizationId, organizationId)];
  const asOfDate = filters.asOfDate;

  if (!filters.includeArchived) {
    conditions.push(isNull(employees.archivedAt));
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(employees.status, filters.status));
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(employees.name, term), ilike(employees.jobTitle, term))!);
  }

  const rows = await db
    .select({
      employee: employees,
      currentRate: sql<string | null>`(
        select rv.base_rate::text
        from rate_versions rv
        where rv.employee_id = ${employees.id}
          and rv.organization_id = ${organizationId}
          and rv.valid_from <= ${asOfDate}::date
          and (rv.valid_to is null or rv.valid_to >= ${asOfDate}::date)
        order by rv.valid_from desc
        limit 1
      )`,
      currentRateUnit: sql<RateUnit | null>`(
        select rv.rate_unit
        from rate_versions rv
        where rv.employee_id = ${employees.id}
          and rv.organization_id = ${organizationId}
          and rv.valid_from <= ${asOfDate}::date
          and (rv.valid_to is null or rv.valid_to >= ${asOfDate}::date)
        order by rv.valid_from desc
        limit 1
      )`,
      currentRateCurrency: sql<string | null>`(
        select rv.currency
        from rate_versions rv
        where rv.employee_id = ${employees.id}
          and rv.organization_id = ${organizationId}
          and rv.valid_from <= ${asOfDate}::date
          and (rv.valid_to is null or rv.valid_to >= ${asOfDate}::date)
        order by rv.valid_from desc
        limit 1
      )`,
    })
    .from(employees)
    .where(and(...conditions))
    .orderBy(asc(employees.name));

  return rows.map((row) => ({
    ...mapEmployee(row.employee),
    currentRate: row.currentRate,
    currentRateUnit: row.currentRateUnit,
    currentRateCurrency: row.currentRateCurrency,
  }));
}

export async function findEmployeeByUserId(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<EmployeeRecord | null> {
  const [row] = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(employees.userId, userId),
        isNull(employees.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapEmployee(row) : null;
}

export async function countEmployees(db: DbExecutor, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), isNull(employees.archivedAt)));

  return row?.count ?? 0;
}
