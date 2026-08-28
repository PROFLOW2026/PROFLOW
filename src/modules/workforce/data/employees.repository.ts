import { and, asc, eq, ilike, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { employees, organizationMemberships, profiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { EmployeeListItem, EmployeeRecord, RateUnit } from '../domain/types';
import { calculateUnitEmployerCostPool } from '../domain/employer-cost-pool';
import { toNumericString } from '@/shared/money';

export interface OrgMemberLinkOption {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
}

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
    hireDate: row.hireDate ?? null,
    endDate: row.endDate ?? null,
    employmentBasis: (row.employmentBasis as EmployeeRecord['employmentBasis']) ?? null,
    standardHoursPerDay: row.standardHoursPerDay ?? null,
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
    hireDate?: string | null;
    endDate?: string | null;
    employmentBasis?: EmployeeRecord['employmentBasis'];
    standardHoursPerDay?: string | null;
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
      hireDate: input.hireDate ?? null,
      endDate: input.endDate ?? null,
      employmentBasis: input.employmentBasis ?? null,
      standardHoursPerDay: input.standardHoursPerDay ?? null,
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
    hireDate: string | null;
    endDate: string | null;
    employmentBasis: EmployeeRecord['employmentBasis'];
    standardHoursPerDay: string | null;
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

/** Serializes concurrent time-entry creates for the same employee. */
export async function lockEmployeeRowForUpdate(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<void> {
  await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
    .for('update');
}

export async function listEmployees(
  db: DbExecutor,
  organizationId: string,
  filters: {
    search?: string;
    includeArchived?: boolean;
    status?: EmployeeRecord['status'] | 'all';
    /** Org-timezone business date - must match detail (`todayInTimeZone`), never DB `current_date`. */
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

  // Drizzle strips table qualifiers inside select-list `sql\`\`` chunks, so
  // `${employees.id}` becomes bare `id` and correlates to rate_versions.id
  // (always null). Qualify the outer employee id explicitly.
  const employeeIdRef = sql.raw('"employees"."id"');

  const rows = await db
    .select({
      employee: employees,
      currentRate: sql<string | null>`(
        coalesce(
          (
            select rv.base_rate::text
            from rate_versions rv
            where rv.employee_id = ${employeeIdRef}
              and rv.organization_id = ${organizationId}
              and rv.valid_from <= ${asOfDate}::date
              and (rv.valid_to is null or rv.valid_to >= ${asOfDate}::date)
            order by rv.valid_from desc
            limit 1
          ),
          (
            select rv.base_rate::text
            from rate_versions rv
            where rv.employee_id = ${employeeIdRef}
              and rv.organization_id = ${organizationId}
              and rv.valid_to is null
            order by rv.valid_from desc
            limit 1
          )
        )
      )`,
      currentRateUnit: sql<RateUnit | null>`(
        coalesce(
          (
            select rv.rate_unit
            from rate_versions rv
            where rv.employee_id = ${employeeIdRef}
              and rv.organization_id = ${organizationId}
              and rv.valid_from <= ${asOfDate}::date
              and (rv.valid_to is null or rv.valid_to >= ${asOfDate}::date)
            order by rv.valid_from desc
            limit 1
          ),
          (
            select rv.rate_unit
            from rate_versions rv
            where rv.employee_id = ${employeeIdRef}
              and rv.organization_id = ${organizationId}
              and rv.valid_to is null
            order by rv.valid_from desc
            limit 1
          )
        )
      )`,
      currentRateCurrency: sql<string | null>`(
        coalesce(
          (
            select rv.currency
            from rate_versions rv
            where rv.employee_id = ${employeeIdRef}
              and rv.organization_id = ${organizationId}
              and rv.valid_from <= ${asOfDate}::date
              and (rv.valid_to is null or rv.valid_to >= ${asOfDate}::date)
            order by rv.valid_from desc
            limit 1
          ),
          (
            select rv.currency
            from rate_versions rv
            where rv.employee_id = ${employeeIdRef}
              and rv.organization_id = ${organizationId}
              and rv.valid_to is null
            order by rv.valid_from desc
            limit 1
          )
        )
      )`,
      currentBurdenPercent: sql<string | null>`(
        coalesce(
          (
            select rv.burden_percent::text
            from rate_versions rv
            where rv.employee_id = ${employeeIdRef}
              and rv.organization_id = ${organizationId}
              and rv.valid_from <= ${asOfDate}::date
              and (rv.valid_to is null or rv.valid_to >= ${asOfDate}::date)
            order by rv.valid_from desc
            limit 1
          ),
          (
            select rv.burden_percent::text
            from rate_versions rv
            where rv.employee_id = ${employeeIdRef}
              and rv.organization_id = ${organizationId}
              and rv.valid_to is null
            order by rv.valid_from desc
            limit 1
          )
        )
      )`,
    })
    .from(employees)
    .where(and(...conditions))
    .orderBy(asc(employees.name));

  return rows.map((row) => {
    const currentEmployerCost =
      row.currentRate && row.currentRateCurrency
        ? toNumericString(
            calculateUnitEmployerCostPool({
              baseRate: row.currentRate,
              currency: row.currentRateCurrency,
              burdenPercent: row.currentBurdenPercent,
            }).total,
          )
        : null;

    return {
      ...mapEmployee(row.employee),
      currentRate: row.currentRate,
      currentRateUnit: row.currentRateUnit,
      currentRateCurrency: row.currentRateCurrency,
      currentEmployerCost,
    };
  });
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

export async function findEmployeeByLinkedUserId(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  exceptEmployeeId?: string,
): Promise<EmployeeRecord | null> {
  const conditions = [
    eq(employees.organizationId, organizationId),
    eq(employees.userId, userId),
  ];
  if (exceptEmployeeId) {
    conditions.push(ne(employees.id, exceptEmployeeId));
  }
  const [row] = await db.select().from(employees).where(and(...conditions)).limit(1);
  return row ? mapEmployee(row) : null;
}

/** Active org members for the employee ↔ login picker (tenant-scoped). */
export async function listActiveOrgMembersForLinking(
  db: DbExecutor,
  organizationId: string,
): Promise<OrgMemberLinkOption[]> {
  const rows = await db
    .select({
      userId: organizationMemberships.userId,
      email: profiles.email,
      displayName: profiles.displayName,
    })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .orderBy(asc(profiles.displayName), asc(profiles.email));

  return rows;
}

export async function listLinkedEmployeeUserIds(
  db: DbExecutor,
  organizationId: string,
  exceptEmployeeId?: string,
): Promise<Set<string>> {
  const conditions = [
    eq(employees.organizationId, organizationId),
    isNotNull(employees.userId),
  ];
  if (exceptEmployeeId) {
    conditions.push(ne(employees.id, exceptEmployeeId));
  }
  const rows = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(and(...conditions));

  return new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)));
}
