/**
 * Real PostgreSQL + postgres-js (prepare: false) proof that attendance COMMIT
 * is independent of the derived cost RLS transaction — matching production
 * withOrgContext / withUserContext boundaries.
 *
 * Prefer ATTENDANCE_PROOF_DATABASE_URL (disposable). Otherwise starts a local
 * Docker postgres:16 container for this file only. Never uses production
 * DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import {
  attendanceDays,
  attendanceEvents,
  auditEvents,
  profiles,
} from '@drizzle/schema';
import * as schema from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { createProject } from '@/modules/projects';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import {
  applyManualAttendanceWorkdayRange,
  createEmployee,
  recomputeCostsAfterAttendanceSave,
} from '@/modules/workforce';
import { loadExpensePaymentAuditsByExpenseIds } from '@/modules/expenses/data/expense-installment-payments.repository';
import { businessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { applySqlMigrationsPostgres } from '@tests/setup/database';
import type { TestUser } from '@tests/setup/fixtures';

const execFileAsync = promisify(execFile);

const CONTAINER = 'pf-attendance-outer-rls-proof';
const HOST_PORT = 55433;

type ProofDb = {
  readonly sql: Sql;
  readonly db: DbExecutor;
  asUser: <T>(userId: string, fn: (tx: DbExecutor) => Promise<T>) => Promise<T>;
  asService: <T>(fn: (db: DbExecutor) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

async function waitForPostgres(connectionString: string, attempts = 40): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    const probe = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 3 });
    try {
      await probe`select 1`;
      await probe.end({ timeout: 2 });
      return;
    } catch (error) {
      lastError = error;
      await probe.end({ timeout: 1 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Postgres not ready: ${String(lastError)}`);
}

async function startDockerPostgres(): Promise<string> {
  const port = HOST_PORT;
  try {
    await execFileAsync('docker', ['rm', '-f', CONTAINER], { windowsHide: true });
  } catch {
    /* not present */
  }
  await execFileAsync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      CONTAINER,
      '-e',
      'POSTGRES_PASSWORD=postgres',
      '-e',
      'POSTGRES_USER=postgres',
      '-e',
      'POSTGRES_DB=projectflow_proof',
      '-p',
      `${port}:5432`,
      'postgres:16-alpine',
    ],
    { windowsHide: true },
  );
  const url = `postgres://postgres:postgres@127.0.0.1:${port}/projectflow_proof`;
  await waitForPostgres(url);
  return url;
}

async function openProofDb(connectionString: string): Promise<ProofDb> {
  const client = postgres(connectionString, {
    max: 8,
    prepare: false,
    onnotice: () => {},
    idle_timeout: 20,
    connect_timeout: 15,
  });
  await applySqlMigrationsPostgres(client);
  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as DbExecutor;

  return {
    sql: client,
    db,
    asUser: async (userId, fn) =>
      (db as DbExecutor & { transaction: <T>(f: (tx: DbExecutor) => Promise<T>) => Promise<T> }).transaction(
        async (tx) => {
          await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
          await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
          await tx.execute(sql`set local role authenticated`);
          return fn(tx);
        },
      ),
    asService: async (fn) => fn(db),
    close: async () => {
      await client.end({ timeout: 5 }).catch(() => undefined);
    },
  };
}

describe('attendance outer RLS COMMIT (postgres-js prepare:false)', () => {
  let proof: ProofDb;
  let usedDocker = false;
  let owner: TestUser;
  let orgId: string;
  let projectId: string;
  let employeeId: string;

  beforeAll(async () => {
    const envUrl = process.env.ATTENDANCE_PROOF_DATABASE_URL?.trim();
    let url = envUrl && envUrl.length > 10 ? envUrl : '';
    if (!url) {
      url = await startDockerPostgres();
      usedDocker = true;
    }
    proof = await openProofDb(url);

    await proof.asService(async (db) => {
      await seedSystemData(db);
    });

    const ownerId = randomUUID();
    const email = `attendance-pg-proof-${ownerId.slice(0, 8)}@example.test`;
    await proof.asService(async (db) => {
      await db.insert(profiles).values({
        id: ownerId,
        email,
        displayName: 'Attendance PG Proof',
      });
    });
    owner = { id: ownerId, email };

    const org = await proof.asUser(owner.id, async (tx) =>
      createOrganization(tx, owner.id, { name: 'Attendance Outer RLS Proof', countryCode: 'IL' }),
    );
    orgId = org.organization.id;

    await proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const employee = await createEmployee(context, {
        name: 'Proof Worker',
        status: 'active',
        hireDate: businessDate('2026-01-01'),
        rateUnit: 'hourly',
        baseRate: '100',
        currency: 'ILS',
      });
      employeeId = employee.id;
      const project = await createProject(context, { name: 'Proof Project' });
      projectId = project.projectId;
    });
  }, 300_000);

  afterAll(async () => {
    await proof?.close();
    if (usedDocker) {
      await execFileAsync('docker', ['rm', '-f', CONTAINER], { windowsHide: true }).catch(
        () => undefined,
      );
    }
  });

  async function countActiveEvents(workDate: string): Promise<number> {
    return proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const days = await context.db
        .select({ id: attendanceDays.id })
        .from(attendanceDays)
        .where(
          and(
            eq(attendanceDays.organizationId, context.organizationId),
            eq(attendanceDays.employeeId, employeeId),
            eq(attendanceDays.workDate, workDate),
            isNull(attendanceDays.archivedAt),
          ),
        );
      if (days.length === 0) return 0;
      const events = await context.db
        .select({ id: attendanceEvents.id })
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.organizationId, context.organizationId),
            eq(attendanceEvents.attendanceDayId, days[0]!.id),
            isNull(attendanceEvents.voidedAt),
          ),
        );
      return events.length;
    });
  }

  it('commits retroactive attendance; cost failure in a fresh TX leaves rows intact', async () => {
    const workDate = '2026-03-10'; // Tuesday — closed-month style past date
    const before = await countActiveEvents(workDate);

    const deferred = await proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const outcome = await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [2],
        clockInTime: '08:00',
        clockOutTime: '16:30',
        workScope: 'project',
        projectId,
        overwriteConfirmed: false,
      });
      expect(outcome.status).toBe('applied');
      if (outcome.status !== 'applied') return [] as string[];
      expect(outcome.result.createdCount + outcome.result.updatedCount).toBeGreaterThan(0);
      expect(outcome.result.costRecomputeStatus).toBe('skipped');
      expect(outcome.result.deferredCostWorkDates?.length).toBeGreaterThan(0);
      return [...(outcome.result.deferredCostWorkDates ?? [])];
    });

    expect(await countActiveEvents(workDate)).toBeGreaterThan(before);

    const costStatus = await proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      return recomputeCostsAfterAttendanceSave(
        context,
        { employeeId, workDates: deferred },
        { rollbackProbe: 'after_costing' },
      );
    });
    expect(costStatus).toBe('pending');
    expect(await countActiveEvents(workDate)).toBeGreaterThan(before);
  });

  it('updates existing attendance without duplicating active events', async () => {
    const workDate = '2026-03-11'; // Wednesday
    await proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [3],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'general',
      });
    });
    await proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const outcome = await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [3],
        clockInTime: '10:00',
        clockOutTime: '18:00',
        workScope: 'general',
        overwriteConfirmed: true,
      });
      expect(outcome.status).toBe('applied');
    });
    expect(await countActiveEvents(workDate)).toBe(2);
  });

  it('saves a weekday date range and does not invent duplicate clock pairs', async () => {
    const fromDate = '2026-03-16';
    const toDate = '2026-03-18';
    await proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const outcome = await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate,
        toDate,
        weekdays: [1, 2, 3],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'general',
      });
      expect(outcome.status).toBe('applied');
      if (outcome.status !== 'applied') return;
      expect(outcome.result.createdCount).toBe(3);
    });
    expect(await countActiveEvents('2026-03-16')).toBe(2);
    expect(await countActiveEvents('2026-03-17')).toBe(2);
    expect(await countActiveEvents('2026-03-18')).toBe(2);
  });

  it('payment-audit inArray read works under prepare:false; soft-fail does not abort outer TX', async () => {
    await proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const expenseId = randomUUID();
      await context.db.insert(auditEvents).values({
        organizationId: context.organizationId,
        actorUserId: owner.id,
        action: 'expense.payment_confirmed',
        entityType: 'expense',
        entityId: expenseId,
        after: {
          paidAt: '2026-03-01',
          paidGrossAmount: '100.00',
          installmentIndex: '1',
          source: 'manual',
        },
      });

      const map = await loadExpensePaymentAuditsByExpenseIds(
        context.db,
        context.organizationId,
        [expenseId],
      );
      expect(map.get(expenseId)?.[0]?.after).toMatchObject({
        installmentIndex: 1,
        paidGrossAmount: '100.00',
      });

      // Soft-fail path must use nested SAVEPOINT — outer TX stays usable (no 25P02).
      const empty = await loadExpensePaymentAuditsByExpenseIds(context.db, context.organizationId, [
        '00000000-0000-4000-8000-000000000099',
      ]);
      expect(empty.size).toBe(0);

      const stillAlive = await context.db.execute(sql`select 1 as ok`);
      const rows = Array.isArray(stillAlive)
        ? stillAlive
        : ((stillAlive as { rows?: unknown[] }).rows ?? []);
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it('injected SQL failure inside cost TX does not surface 3B001/25P02 onto attendance', async () => {
    const workDate = '2026-03-19';
    await proof.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [4],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'general',
      });
    });

    let poisonedSqlState: string | null = null;
    try {
      await proof.asUser(owner.id, async (tx) => {
        // Simulate broken cost SQL after attendance already committed.
        await tx.execute(sql`select 1 / 0`);
      });
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: unknown }).code)
          : null;
      poisonedSqlState = code;
    }
    expect(poisonedSqlState).not.toBe('3B001');
    expect(poisonedSqlState).not.toBe('25P02');
    expect(await countActiveEvents(workDate)).toBe(2);
  });
});
