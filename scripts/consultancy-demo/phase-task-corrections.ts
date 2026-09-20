import type { TaskStatus } from '../../src/modules/tasks/domain/types.ts';
import { SEED_MARKER } from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import type { ProjectSpec } from './generate-specs.ts';
import {
  DEMO_TODAY,
  TECHNICAL_EMPLOYEE_KEYS,
  dueDateForOperationalBucket,
  isOpenStatus,
  parseAdminTaskIndex,
  parseSeedTaskKey,
  pickEstimatedEffortMinutes,
  planOperationalBuckets,
  projectDocNumsForEmployee,
  shouldAssignEffort,
  targetDatesForTask,
  targetStatusForTask,
  TARGET_DISTRIBUTION,
} from './task-distribution.ts';
import {
  loadSeedRegistry,
  parseSeedAdminTaskRegistryKey,
  parseSeedTaskRegistryKey,
} from './seed-registry.ts';

export interface TaskDistributionReport {
  tasksDone: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksDueThisWeek: number;
  tasksWithEffort: number;
  technicalEmployeeProjectLinks: number;
  dueToday: number;
  blocked: number;
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function applyTaskDistributionCorrections(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
  maps: SeedMaps,
  projectSpecs: readonly ProjectSpec[],
): Promise<TaskDistributionReport> {
  const report: TaskDistributionReport = {
    tasksDone: 0,
    tasksOpen: 0,
    tasksOverdue: 0,
    tasksDueThisWeek: 0,
    tasksWithEffort: 0,
    technicalEmployeeProjectLinks: 0,
    dueToday: 0,
    blocked: 0,
  };

  const specByDoc = new Map(projectSpecs.map((spec) => [spec.docNum, spec]));
  const taskCountByDoc = new Map(projectSpecs.map((spec) => [spec.docNum, spec.taskCount]));

  await runPhase('correct task status and dates', target.organizationId, target.userId, async (context) => {
    const { tasks } = await import('@drizzle/schema');
    const { and, eq, like } = await import('drizzle-orm');

    const rows = await context.db
      .select({
        id: tasks.id,
        description: tasks.description,
        status: tasks.status,
      })
      .from(tasks)
      .where(and(eq(tasks.organizationId, target.organizationId), like(tasks.description, `%${SEED_MARKER}%`)));

    const openCandidates: Array<{ id: string; docNum: string; index: number }> = [];

    const applyRow = async (
      id: string,
      parsed: { docNum: string; index: number } | null,
      adminIndex: number | null,
    ) => {
      if (parsed) {
        const spec = specByDoc.get(parsed.docNum);
        if (!spec || parsed.index >= (taskCountByDoc.get(parsed.docNum) ?? 0)) return;

        const status = targetStatusForTask(parsed.index, spec.taskCount, spec.activity, spec.bucket);
        const dates = targetDatesForTask(status, spec, parsed.index);
        const estimatedEffortMinutes = shouldAssignEffort(parsed.docNum, parsed.index, status)
          ? pickEstimatedEffortMinutes(parsed.docNum, parsed.index)
          : null;

        await context.db
          .update(tasks)
          .set({
            status,
            dueDate: dates.dueDate,
            completionDate: dates.completionDate,
            estimatedEffortMinutes,
          })
          .where(eq(tasks.id, id));

        if (isOpenStatus(status)) {
          openCandidates.push({ id, docNum: parsed.docNum, index: parsed.index });
        }
        return;
      }

      if (adminIndex !== null && adminIndex < 8) {
        await context.db
          .update(tasks)
          .set({
            status: 'todo',
            dueDate: addDaysIso(DEMO_TODAY, adminIndex % 5),
            completionDate: null,
            estimatedEffortMinutes: null,
          })
          .where(eq(tasks.id, id));
      }
    };

    const registry = await loadSeedRegistry(context.db, target.organizationId);
    for (const [key, id] of Object.entries(registry)) {
      const parsed = parseSeedTaskRegistryKey(key);
      if (parsed) {
        await applyRow(id, parsed, null);
        continue;
      }
      const adminIndex = parseSeedAdminTaskRegistryKey(key);
      if (adminIndex !== null) {
        await applyRow(id, null, adminIndex);
      }
    }

    for (const row of rows) {
      const desc = row.description ?? '';
      const parsed = parseSeedTaskKey(desc);
      if (parsed) {
        await applyRow(row.id, parsed, null);
        continue;
      }

      const adminIndex = parseAdminTaskIndex(desc);
      if (adminIndex !== null) {
        await applyRow(row.id, null, adminIndex);
      }
    }

    const buckets = planOperationalBuckets(
      openCandidates.slice(0, TARGET_DISTRIBUTION.openTotal.max).map((row) => row.id),
    );
    const idToMeta = new Map(openCandidates.map((row) => [row.id, row]));

    const applyBucket = async (
      ids: readonly string[],
      bucket: keyof ReturnType<typeof planOperationalBuckets>,
      forceStatus?: TaskStatus,
    ) => {
      for (const id of ids) {
        const meta = idToMeta.get(id);
        if (!meta) continue;
        const dueDate = dueDateForOperationalBucket(bucket, meta.docNum, meta.index);
        const patch: {
          dueDate: string;
          status?: TaskStatus;
        } = { dueDate };
        if (forceStatus) patch.status = forceStatus;
        await context.db.update(tasks).set(patch).where(eq(tasks.id, id));
      }
    };

    await applyBucket(buckets.dueTodayIds, 'dueTodayIds');
    await applyBucket(buckets.blockedIds, 'blockedIds', 'blocked');
    await applyBucket(buckets.overdueIds, 'overdueIds');
    await applyBucket(buckets.dueThisWeekIds, 'dueThisWeekIds');
    await applyBucket(buckets.futureIds, 'futureIds');

    stats.notes.push(
      `Task distribution: ${openCandidates.length} open after status pass; operational buckets applied.`,
    );
  });

  await runPhase('ensure technical project assignments', target.organizationId, target.userId, async (context) => {
    const { employeeProjectAssignments } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    const { insertEmployeeProjectAssignment } = await import(
      '../../src/modules/workforce/data/project-team.repository.ts'
    );

    for (const employeeKey of TECHNICAL_EMPLOYEE_KEYS) {
      const employeeId = maps.employeeIds.get(employeeKey);
      if (!employeeId) continue;

      for (const docNum of projectDocNumsForEmployee(employeeKey, projectSpecs)) {
        const projectId = maps.projectIds.get(docNum);
        if (!projectId) continue;

        const [existing] = await context.db
          .select({ id: employeeProjectAssignments.id })
          .from(employeeProjectAssignments)
          .where(
            and(
              eq(employeeProjectAssignments.organizationId, target.organizationId),
              eq(employeeProjectAssignments.employeeId, employeeId),
              eq(employeeProjectAssignments.projectId, projectId),
              eq(employeeProjectAssignments.status, 'active'),
            ),
          )
          .limit(1);
        if (existing) {
          report.technicalEmployeeProjectLinks += 1;
          continue;
        }

        const spec = specByDoc.get(docNum);
        await insertEmployeeProjectAssignment(context.db, {
          organizationId: target.organizationId,
          projectId,
          employeeId,
          startDate: spec?.startDate ?? '2026-01-01',
          role: 'engineer',
          notes: `${SEED_MARKER}:workload-link:${employeeKey}:${docNum}`,
          status: 'active',
        });
        report.technicalEmployeeProjectLinks += 1;
      }
    }

    stats.notes.push(
      `Technical employee project links: ${report.technicalEmployeeProjectLinks} active assignments.`,
    );
  });

  await runPhase('task distribution metrics', target.organizationId, target.userId, async (context) => {
    const { tasks } = await import('@drizzle/schema');
    const { and, eq, like, inArray, sql, lt, gte, lte } = await import('drizzle-orm');
    const markerLike = `%${SEED_MARKER}%`;
    const weekEnd = addDaysIso(DEMO_TODAY, 7);
    const openStatuses = ['todo', 'in_progress', 'in_review', 'blocked'] as const;

    report.tasksDone = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.organizationId, target.organizationId), like(tasks.description, markerLike), eq(tasks.status, 'done')))
      .then((rows) => rows[0]?.count ?? 0);

    report.tasksOpen = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, target.organizationId),
          like(tasks.description, markerLike),
          inArray(tasks.status, [...openStatuses]),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);

    report.tasksOverdue = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, target.organizationId),
          like(tasks.description, markerLike),
          inArray(tasks.status, [...openStatuses]),
          lt(tasks.dueDate, DEMO_TODAY),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);

    report.tasksDueThisWeek = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, target.organizationId),
          like(tasks.description, markerLike),
          inArray(tasks.status, [...openStatuses]),
          gte(tasks.dueDate, DEMO_TODAY),
          lte(tasks.dueDate, weekEnd),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);

    report.tasksWithEffort = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, target.organizationId),
          like(tasks.description, markerLike),
          sql`${tasks.estimatedEffortMinutes} is not null`,
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);

    report.dueToday = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, target.organizationId),
          like(tasks.description, markerLike),
          eq(tasks.dueDate, DEMO_TODAY),
          inArray(tasks.status, [...openStatuses]),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);

    report.blocked = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, target.organizationId),
          like(tasks.description, markerLike),
          eq(tasks.status, 'blocked'),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);
  });

  return report;
}
