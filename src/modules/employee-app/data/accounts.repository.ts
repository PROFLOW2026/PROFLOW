import { and, eq } from 'drizzle-orm';
import { employeeAppAccounts } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { EmployeeAppAccountRecord, EmployeeAppStatus } from '../domain/types';

function mapRow(row: typeof employeeAppAccounts.$inferSelect): EmployeeAppAccountRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    userId: row.userId,
    status: row.status as EmployeeAppStatus,
    username: row.username,
    usernameNormalized: row.usernameNormalized,
    authEmail: row.authEmail,
    pinMustChange: row.pinMustChange,
    temporaryPinExpiresAt: row.temporaryPinExpiresAt,
    firstLoginAt: row.firstLoginAt,
    lastLoginAt: row.lastLoginAt,
    accessStartsAt: row.accessStartsAt,
    accessEndsAt: row.accessEndsAt,
    disabledAt: row.disabledAt,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
  };
}

export async function findEmployeeAppAccountByEmployeeId(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<EmployeeAppAccountRecord | null> {
  const [row] = await db
    .select()
    .from(employeeAppAccounts)
    .where(
      and(
        eq(employeeAppAccounts.organizationId, organizationId),
        eq(employeeAppAccounts.employeeId, employeeId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function findEmployeeAppAccountByUserId(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<EmployeeAppAccountRecord | null> {
  const [row] = await db
    .select()
    .from(employeeAppAccounts)
    .where(
      and(
        eq(employeeAppAccounts.organizationId, organizationId),
        eq(employeeAppAccounts.userId, userId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function findEmployeeAppAccountByUsername(
  db: DbExecutor,
  organizationId: string,
  usernameNormalized: string,
): Promise<EmployeeAppAccountRecord | null> {
  const [row] = await db
    .select()
    .from(employeeAppAccounts)
    .where(
      and(
        eq(employeeAppAccounts.organizationId, organizationId),
        eq(employeeAppAccounts.usernameNormalized, usernameNormalized),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function insertEmployeeAppAccount(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    userId: string;
    username: string;
    usernameNormalized: string;
    authEmail: string;
    status: EmployeeAppStatus;
    pinMustChange: boolean;
    temporaryPinExpiresAt: Date | null;
    createdByUserId: string;
  },
): Promise<EmployeeAppAccountRecord> {
  const [row] = await db
    .insert(employeeAppAccounts)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      userId: input.userId,
      username: input.username,
      usernameNormalized: input.usernameNormalized,
      authEmail: input.authEmail,
      status: input.status,
      pinMustChange: input.pinMustChange,
      temporaryPinExpiresAt: input.temporaryPinExpiresAt,
      createdByUserId: input.createdByUserId,
    })
    .returning();
  return mapRow(row!);
}

export async function updateEmployeeAppAccount(
  db: DbExecutor,
  organizationId: string,
  accountId: string,
  patch: Partial<{
    status: EmployeeAppStatus;
    username: string;
    usernameNormalized: string;
    pinMustChange: boolean;
    temporaryPinExpiresAt: Date | null;
    firstLoginAt: Date | null;
    lastLoginAt: Date | null;
    accessStartsAt: Date | null;
    accessEndsAt: Date | null;
    disabledAt: Date | null;
    failedLoginCount: number;
    lockedUntil: Date | null;
  }>,
): Promise<EmployeeAppAccountRecord | null> {
  const [row] = await db
    .update(employeeAppAccounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(employeeAppAccounts.id, accountId),
        eq(employeeAppAccounts.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}
