import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import {
  attendanceDays,
  attendanceEvents,
  auditEvents,
} from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import {
  closeMonthClosePeriod,
  ensureMonthClosePeriod,
  markMonthCloseReady,
} from '@/modules/month-close';
import {
  applyManualAttendanceWorkdayRange,
  createEmployee,
  getProjectLaborCost,
} from '@/modules/workforce';
import { listTimeEntries } from '@/modules/workforce/data/time-entries.repository';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import type { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

async function countActiveAttendanceEvents(
  context: OrgContext,
  employeeId: string,
  workDate: string,
): Promise<number> {
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
}

async function countRecordedTime(
  context: OrgContext,
  employeeId: string,
  workDate: string,
  projectId?: string,
): Promise<number> {
  const rows = await listTimeEntries(context.db, context.organizationId, {
    employeeId,
    fromDate: workDate,
    toDate: workDate,
    status: 'recorded',
    approvalStatus: 'all',
    projectId,
    limit: 50,
  });
  return rows.filter((row) => !row.voidedAt && !row.archivedAt).length;
}

async function countOverwriteAudits(context: OrgContext, employeeId: string): Promise<number> {
  const rows = await context.db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, context.organizationId),
        eq(auditEvents.entityType, 'attendance_overwrite'),
        eq(auditEvents.entityId, employeeId),
      ),
    );
  return rows.length;
}

describe('attendance ↔ project atomicity', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let projectAId: string;
  let projectBId: string;
  let employeeId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
    owner = await createTestUser(database, 'attendance-atomic-owner@example.test');
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Attendance Atomic Co', countryCode: 'IL' }),
    );
    orgId = org.organization.id;
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const employee = await createEmployee(context, {
        name: `Worker ${Date.now()}`,
        status: 'active',
        hireDate: businessDate('2026-01-01'),
        rateUnit: 'hourly',
        baseRate: '100',
        currency: 'ILS',
      });
      employeeId = employee.id;
      const projectA = await createProject(context, { name: `Project A ${Date.now()}` });
      const projectB = await createProject(context, { name: `Project B ${Date.now()}` });
      projectAId = projectA.projectId;
      projectBId = projectB.projectId;
    });
  });

  const workDate = '2026-07-14'; // Tuesday

  it('A. successful new attendance + project commits all', async () => {
    await database.asUser(owner.id, async (tx) => {
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
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'project',
        projectId: projectAId,
        overwriteConfirmed: false,
      });
      expect(outcome.status).toBe('applied');
      if (outcome.status !== 'applied') return;
      expect(outcome.result.createdCount).toBe(1);
      expect(outcome.result.projectTimeCreatedCount).toBe(1);
      expect(outcome.result.projectTimeApprovedCount).toBe(1);
      expect(await countActiveAttendanceEvents(context, employeeId, workDate)).toBe(2);
      expect(await countRecordedTime(context, employeeId, workDate, projectAId)).toBe(1);
      const labor = await getProjectLaborCost(context, projectAId);
      expect(Number(labor.laborCost.amount)).toBeGreaterThan(0);
    });
  });

  it('B. successful overwrite A → B commits all', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [2],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'project',
        projectId: projectAId,
      });
      const outcome = await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [2],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'project',
        projectId: projectBId,
        overwriteConfirmed: true,
      });
      expect(outcome.status).toBe('applied');
      expect(await countRecordedTime(context, employeeId, workDate, projectAId)).toBe(0);
      expect(await countRecordedTime(context, employeeId, workDate, projectBId)).toBe(1);
      const laborA = await getProjectLaborCost(context, projectAId);
      const laborB = await getProjectLaborCost(context, projectBId);
      expect(Number(laborA.laborCost.amount)).toBe(0);
      expect(Number(laborB.laborCost.amount)).toBeGreaterThan(0);
    });
  });

  it('C. project-sync injected failure rolls back attendance', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const beforeAtt = await countActiveAttendanceEvents(context, employeeId, workDate);
      const beforeTime = await countRecordedTime(context, employeeId, workDate);

      await expect(
        applyManualAttendanceWorkdayRange(
          context,
          {
            employeeId,
            fromDate: workDate,
            toDate: workDate,
            weekdays: [2],
            clockInTime: '09:00',
            clockOutTime: '17:00',
            workScope: 'project',
            projectId: projectAId,
          },
          { rollbackProbe: 'after_project_work' },
        ),
      ).rejects.toMatchObject({
        messageKey: 'workforce.errors.attendanceApplyRollbackProbe',
      } satisfies Partial<DomainRuleError>);

      expect(await countActiveAttendanceEvents(context, employeeId, workDate)).toBe(beforeAtt);
      expect(await countRecordedTime(context, employeeId, workDate)).toBe(beforeTime);
      expect(await countOverwriteAudits(context, employeeId)).toBe(0);
    });
  });

  it('D. costing injected failure rolls back all', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const beforeAtt = await countActiveAttendanceEvents(context, employeeId, workDate);
      const beforeTime = await countRecordedTime(context, employeeId, workDate);

      await expect(
        applyManualAttendanceWorkdayRange(
          context,
          {
            employeeId,
            fromDate: workDate,
            toDate: workDate,
            weekdays: [2],
            clockInTime: '09:00',
            clockOutTime: '17:00',
            workScope: 'project',
            projectId: projectAId,
          },
          { rollbackProbe: 'after_costing' },
        ),
      ).rejects.toMatchObject({
        messageKey: 'workforce.errors.attendanceApplyRollbackProbe',
      } satisfies Partial<DomainRuleError>);

      expect(await countActiveAttendanceEvents(context, employeeId, workDate)).toBe(beforeAtt);
      expect(await countRecordedTime(context, employeeId, workDate)).toBe(beforeTime);
    });
  });

  it('E. audit injected failure rolls back overwrite', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [2],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'project',
        projectId: projectAId,
      });
      const beforeTimeA = await countRecordedTime(context, employeeId, workDate, projectAId);
      const beforeTimeB = await countRecordedTime(context, employeeId, workDate, projectBId);
      const beforeAudits = await countOverwriteAudits(context, employeeId);

      await expect(
        applyManualAttendanceWorkdayRange(
          context,
          {
            employeeId,
            fromDate: workDate,
            toDate: workDate,
            weekdays: [2],
            clockInTime: '10:00',
            clockOutTime: '18:00',
            workScope: 'project',
            projectId: projectBId,
            overwriteConfirmed: true,
          },
          { rollbackProbe: 'during_audit' },
        ),
      ).rejects.toMatchObject({
        messageKey: 'workforce.errors.attendanceApplyRollbackProbe',
      } satisfies Partial<DomainRuleError>);

      expect(await countRecordedTime(context, employeeId, workDate, projectAId)).toBe(beforeTimeA);
      expect(await countRecordedTime(context, employeeId, workDate, projectBId)).toBe(beforeTimeB);
      expect(await countOverwriteAudits(context, employeeId)).toBe(beforeAudits);
    });
  });

  it('F. repeated same operation does not duplicate', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const input = {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [2] as number[],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'project' as const,
        projectId: projectAId,
      };
      await applyManualAttendanceWorkdayRange(context, input);
      await applyManualAttendanceWorkdayRange(context, {
        ...input,
        overwriteConfirmed: true,
      });
      expect(await countRecordedTime(context, employeeId, workDate, projectAId)).toBe(1);
      expect(await countActiveAttendanceEvents(context, employeeId, workDate)).toBe(2);
    });
  });

  it('G. general/office creates attendance without project time', async () => {
    await database.asUser(owner.id, async (tx) => {
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
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'general',
      });
      expect(outcome.status).toBe('applied');
      if (outcome.status !== 'applied') return;
      expect(outcome.result.projectTimeCreatedCount).toBe(0);
      expect(await countActiveAttendanceEvents(context, employeeId, workDate)).toBe(2);
      expect(await countRecordedTime(context, employeeId, workDate)).toBe(0);
      const labor = await getProjectLaborCost(context, projectAId);
      expect(Number(labor.laborCost.amount)).toBe(0);
    });
  });

  it('H. closed period rejects with zero mutation', async () => {
    const closedWorkDate = '2028-04-11'; // Tuesday in an unused month
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const period = await ensureMonthClosePeriod(context, { yearMonth: '2028-04' });
      await markMonthCloseReady(context, { periodId: period.id });
      const closed = await closeMonthClosePeriod(context, { periodId: period.id });
      expect(closed.status).toBe('closed');

      const beforeAtt = await countActiveAttendanceEvents(context, employeeId, closedWorkDate);
      const beforeTime = await countRecordedTime(context, employeeId, closedWorkDate);

      await expect(
        applyManualAttendanceWorkdayRange(context, {
          employeeId,
          fromDate: closedWorkDate,
          toDate: closedWorkDate,
          weekdays: [2],
          clockInTime: '09:00',
          clockOutTime: '17:00',
          workScope: 'project',
          projectId: projectAId,
        }),
      ).rejects.toMatchObject({
        messageKey: 'workforce.errors.attendanceClosedPeriod',
      } satisfies Partial<DomainRuleError>);

      expect(await countActiveAttendanceEvents(context, employeeId, closedWorkDate)).toBe(beforeAtt);
      expect(await countRecordedTime(context, employeeId, closedWorkDate)).toBe(beforeTime);
    });
  });
});
