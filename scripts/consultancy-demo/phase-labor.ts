import { BUSINESS_START, EMPLOYEES, HISTORY_END, SEED_MARKER } from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import type { ProjectSpec } from './generate-specs.ts';

const SUN_THU = [0, 1, 2, 3, 4] as const;
const FRIDAY = [5] as const;

const ATTENDANCE_SHIFTS = [
  { in: '08:00', out: '17:00' },
  { in: '08:15', out: '17:15' },
  { in: '08:30', out: '17:30' },
  { in: '07:45', out: '16:45' },
  { in: '08:00', out: '16:00' },
  { in: '08:30', out: '15:30' },
] as const;

const MONTHS = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
] as const;

const MONTH_WEEK_START: Record<string, string> = {
  '2026-01': '2026-01-05',
  '2026-02': '2026-02-02',
  '2026-03': '2026-03-02',
  '2026-04': '2026-04-06',
  '2026-05': '2026-05-04',
  '2026-06': '2026-06-01',
  '2026-07': '2026-07-06',
  '2026-08': '2026-08-03',
  '2026-09': '2026-09-01',
};

function splitAmount(total: string, parts: number): string[] {
  const n = Number(total);
  const base = Math.floor((n / parts) * 100) / 100;
  const amounts = Array.from({ length: parts }, () => base);
  const remainder = Math.round((n - base * parts) * 100) / 100;
  if (parts > 0) amounts[parts - 1] = Math.round((amounts[parts - 1]! + remainder) * 100) / 100;
  return amounts.map((amount) => amount.toFixed(2).replace(/\.00$/, ''));
}

async function chunkDateRange(from: string, to: string, maxDays = 60) {
  const { businessDate, addDays, compareBusinessDates, daysBetween } = await import(
    '../../src/shared/dates/index.ts'
  );
  const chunks: { fromDate: string; toDate: string }[] = [];
  let cursor = businessDate(from);
  const end = businessDate(to);
  while (compareBusinessDates(cursor, end) <= 0) {
    let chunkEnd = cursor;
    while (compareBusinessDates(chunkEnd, end) < 0 && daysBetween(cursor, addDays(chunkEnd, 1)) <= maxDays) {
      chunkEnd = addDays(chunkEnd, 1);
    }
    chunks.push({ fromDate: cursor, toDate: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

function projectRotation(specs: readonly ProjectSpec[], monthIndex: number, count: number): string[] {
  const active = specs.filter((spec) => spec.activity !== 'done' && spec.bucket !== 'completed');
  const pool = active.length > 0 ? active : specs;
  const picked: string[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(pool[(monthIndex * count + i) % pool.length]!.docNum);
  }
  return picked;
}

export interface LaborSeedOptions {
  /** Skip attendance seeding (corrections pass). */
  skipAttendance?: boolean;
  /** Skip monthly employer-cost allocation (corrections pass). */
  skipMonthCost?: boolean;
  /** Only seed missing w2 time blocks when w1 already exists. */
  timeEntryWeeks?: 'all' | 'w2-only';
}

export async function seedLabor(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
  maps: SeedMaps,
  projectSpecs: readonly ProjectSpec[],
  options: LaborSeedOptions = {},
): Promise<void> {
  const { skipAttendance = false, skipMonthCost = false, timeEntryWeeks = 'all' } = options;

  if (!skipAttendance) for (const [index, spec] of EMPLOYEES.entries()) {
    await runPhase(`attendance ${spec.key}`, target.organizationId, target.userId, async (context) => {
      const { applyManualAttendanceWorkdayRange, setAttendanceDayOvertime, listAttendanceDays } =
        await import('../../src/modules/workforce/index.ts');
      const { attendanceDays } = await import('@drizzle/schema');
      const { and, eq, gte, lte, sql } = await import('drizzle-orm');

      const employeeId = maps.employeeIds.get(spec.key);
      if (!employeeId) return;

      const [{ count }] = await context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(attendanceDays)
        .where(
          and(
            eq(attendanceDays.organizationId, target.organizationId),
            eq(attendanceDays.employeeId, employeeId),
            gte(attendanceDays.workDate, BUSINESS_START),
            lte(attendanceDays.workDate, HISTORY_END),
          ),
        );
      if (count >= 120) {
        stats.notes.push(`Attendance exists for ${spec.name}; skipped.`);
        return;
      }

      const shift = ATTENDANCE_SHIFTS[index % ATTENDANCE_SHIFTS.length]!;
      const chunks = await chunkDateRange(BUSINESS_START, HISTORY_END, 28);
      for (const chunk of chunks) {
        try {
          const outcome = await applyManualAttendanceWorkdayRange(context, {
            employeeId,
            fromDate: chunk.fromDate,
            toDate: chunk.toDate,
            weekdays: [...SUN_THU],
            clockInTime: shift.in,
            clockOutTime: shift.out,
            notes: `${SEED_MARKER}:attendance`,
            workScope: 'general',
            overwriteConfirmed: count > 0,
          });
          if (outcome.status === 'needs_overwrite_approval') {
            await applyManualAttendanceWorkdayRange(context, {
              employeeId,
              fromDate: chunk.fromDate,
              toDate: chunk.toDate,
              weekdays: [...SUN_THU],
              clockInTime: shift.in,
              clockOutTime: shift.out,
              notes: `${SEED_MARKER}:attendance`,
              workScope: 'general',
              overwriteConfirmed: true,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('Empty attendance range')) continue;
          throw error;
        }
      }

      if (!spec.companyOnly) {
        for (const fridayDate of ['2026-02-06', '2026-05-08', '2026-08-07'] as const) {
          await applyManualAttendanceWorkdayRange(context, {
            employeeId,
            fromDate: fridayDate,
            toDate: fridayDate,
            weekdays: [...FRIDAY],
            clockInTime: '07:30',
            clockOutTime: '13:00',
            notes: `${SEED_MARKER}:friday-ot`,
            workScope: 'general',
            overwriteConfirmed: true,
          });
          const [day] = await listAttendanceDays(context.db, target.organizationId, {
            employeeId,
            fromDate: fridayDate,
            toDate: fridayDate,
            limit: 1,
          });
          if (day) await setAttendanceDayOvertime(context, { dayId: day.id, isOvertime: true });
        }
      }
    });
  }

  for (const spec of EMPLOYEES) {
    for (const month of MONTHS) {
      await runPhase(`labor ${spec.key} ${month}`, target.organizationId, target.userId, async (context) => {
        const {
          createBulkTimeEntries,
          saveMonthlyEmployerCostDraft,
          applyMonthlyEmployerCostAllocation,
          loadMonthlyEmployerCostReview,
        } = await import('../../src/modules/workforce/index.ts');
        const { addDays } = await import('../../src/shared/dates/index.ts');

        const employeeId = maps.employeeIds.get(spec.key);
        if (!employeeId) return;

        const review = await loadMonthlyEmployerCostReview(context, { employeeId, yearMonth: month });
        const monthCostLocked =
          review.run?.status === 'applied' || review.run?.status === 'closed';

        const monthIndex = MONTHS.indexOf(month);
        const mixCount = spec.chief ? 3 : 2;
        const mix = projectRotation(projectSpecs, monthIndex, mixCount);

        if (!spec.companyOnly && mix.length > 0) {
          const weekStart = MONTH_WEEK_START[month] ?? BUSINESS_START;
          const weekEnd = addDays(weekStart, 4);
          const weekTwoStart = addDays(weekStart, 7);
          const weekTwoEnd = addDays(weekTwoStart, 4);
          const weekBlocks =
            timeEntryWeeks === 'w2-only'
              ? ([{ from: weekTwoStart, to: weekTwoEnd, suffix: 'w2' }] as const)
              : ([
                  { from: weekStart, to: weekEnd, suffix: 'w1' },
                  { from: weekTwoStart, to: weekTwoEnd, suffix: 'w2' },
                ] as const);
          for (const block of weekBlocks) {
            for (const docNum of mix) {
              const projectId = maps.projectIds.get(docNum);
              if (!projectId) continue;
              const description = `${SEED_MARKER}:time:${docNum}:${month}:${block.suffix}`;
              const { timeEntries } = await import('@drizzle/schema');
              const { and, eq } = await import('drizzle-orm');
              const [exists] = await context.db
                .select({ id: timeEntries.id })
                .from(timeEntries)
                .where(
                  and(
                    eq(timeEntries.organizationId, target.organizationId),
                    eq(timeEntries.employeeId, employeeId),
                    eq(timeEntries.description, description),
                  ),
                )
                .limit(1);
              if (exists) continue;
              await createBulkTimeEntries(context, {
                employeeId,
                fromDate: block.from,
                toDate: block.to,
                weekdays: [...SUN_THU],
                hours: spec.chief ? '3' : '3',
                kind: 'project',
                projectId,
                description,
                approveOnCreate: true,
              });
            }
          }
        }

        if (skipMonthCost || monthCostLocked) return;

        try {
          if (spec.companyOnly) {
            await saveMonthlyEmployerCostDraft(context, {
              employeeId,
              yearMonth: month,
              actualAmount: spec.baseRate,
              method: 'fixed_amount',
              companyOnlyAmount: spec.baseRate,
              remainderAllocationIntent: 'company_only',
              allocationLines: [],
            });
            await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth: month });
            return;
          }

          const amounts = splitAmount(spec.baseRate, mix.length);
          const lines = mix
            .map((docNum, idx) => ({ projectId: maps.projectIds.get(docNum), amount: amounts[idx]! }))
            .filter((line): line is { projectId: string; amount: string } => Boolean(line.projectId));
          if (lines.length === 0) return;

          await saveMonthlyEmployerCostDraft(context, {
            employeeId,
            yearMonth: month,
            actualAmount: spec.baseRate,
            method: 'fixed_amount',
            allocationLines: lines,
          });
          await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth: month });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (
            message.includes('monthCostImmutable') ||
            message.includes('cannot be edited') ||
            message.includes('Applied or closed month')
          ) {
            return;
          }
          throw error;
        }
      });
    }
  }
}
