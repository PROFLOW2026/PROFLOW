import type { TaskStatus } from '../../src/modules/tasks/domain/types.ts';
import { HISTORY_END, SEED_MARKER } from './constants.ts';
import type { ProjectBucket, ProjectSpec } from './generate-specs.ts';
import { intBetween, mulberry32, pickWeighted } from './rng.ts';

/** Demo anchor date — matches HISTORY_END / team workload CURRENT_DATE in seed context. */
export const DEMO_TODAY = HISTORY_END;

export const TASK_DESC_RE = new RegExp(
  `${SEED_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:task:(\\d+):(\\d+)`,
);
export const ADMIN_DESC_RE = new RegExp(
  `${SEED_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:admin:(\\d+)`,
);

/** Technical engineers shown on /workload — must have project_count > 0. */
export const TECHNICAL_EMPLOYEE_KEYS = ['e2', 'e3', 'e4', 'e5'] as const;

/** Target open-queue shape after correction (approximate, ~1350 total tasks). */
export const TARGET_DISTRIBUTION = {
  donePct: 0.78,
  openTotal: { min: 180, max: 260 },
  overdueOpen: { min: 28, max: 45 },
  dueToday: { min: 4, max: 8 },
  blocked: { min: 8, max: 14 },
  dueThisWeek: { min: 18, max: 28 },
  withEffortEstimatePct: 0.75,
} as const;

const EFFORT_TIERS = [
  { value: 30, weight: 20 },
  { value: 60, weight: 25 },
  { value: 120, weight: 25 },
  { value: 240, weight: 15 },
  { value: 480, weight: 10 },
  { value: 960, weight: 4 },
  { value: 1920, weight: 1 },
] as const;

const OPEN_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked'];

export function isOpenStatus(status: TaskStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function parseSeedTaskKey(description: string | null): { docNum: string; index: number } | null {
  const match = TASK_DESC_RE.exec(description ?? '');
  if (!match) return null;
  return { docNum: match[1]!, index: Number(match[2]) };
}

export function parseAdminTaskIndex(description: string | null): number | null {
  const match = ADMIN_DESC_RE.exec(description ?? '');
  if (!match) return null;
  return Number(match[1]);
}

/**
 * Deterministic target status — biases heavily toward done for historical realism.
 */
export function targetStatusForTask(
  index: number,
  taskCount: number,
  activity: ProjectSpec['activity'],
  bucket: ProjectBucket,
): TaskStatus {
  if (bucket === 'completed' || activity === 'done') {
    return index >= Math.max(taskCount - 2, 0) ? 'in_progress' : 'done';
  }

  if (bucket === 'waiting' || activity === 'waiting') {
    if (index === 0) return 'in_progress';
    if (index <= 2 && taskCount > 3) return 'blocked';
    return 'todo';
  }

  const ratio = index / Math.max(taskCount - 1, 1);
  if (ratio < 0.58) return 'done';
  if (ratio < 0.72) return index % 4 === 0 ? 'in_progress' : 'done';
  if (ratio < 0.84) return index % 3 === 0 ? 'in_review' : 'in_progress';
  if (ratio < 0.94) return 'todo';
  return index % 6 === 0 ? 'blocked' : 'todo';
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00.000Z`).getTime();
  const b = new Date(`${end}T12:00:00.000Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export interface TaskDateFields {
  dueDate: string;
  completionDate: string | null;
}

/** Due/completion dates aligned with status and project timeline. */
export function targetDatesForTask(
  status: TaskStatus,
  spec: Pick<ProjectSpec, 'docNum' | 'startDate' | 'targetEndDate' | 'bucket' | 'activity'>,
  index: number,
): TaskDateFields {
  const rng = mulberry32(Number(spec.docNum) * 997 + index * 13);
  const span = Math.max(daysBetween(spec.startDate, DEMO_TODAY), 14);

  if (status === 'done') {
    const offset = intBetween(rng, 7, span);
    const completionDate = addDaysIso(spec.startDate, offset);
    const cappedCompletion = completionDate > DEMO_TODAY ? DEMO_TODAY : completionDate;
    const dueLead = intBetween(rng, 0, 5);
    let dueDate = addDaysIso(cappedCompletion, -dueLead);
    if (dueDate < spec.startDate) dueDate = spec.startDate;
    return { dueDate, completionDate: cappedCompletion };
  }

  if (spec.bucket === 'waiting' || spec.activity === 'waiting') {
    const dueDate = addDaysIso(DEMO_TODAY, intBetween(rng, 5, 28));
    return { dueDate, completionDate: null };
  }

  if (status === 'blocked') {
    const dueDate = addDaysIso(DEMO_TODAY, -intBetween(rng, 3, 21));
    return { dueDate, completionDate: null };
  }

  const dueDate = addDaysIso(DEMO_TODAY, intBetween(rng, -14, 21));
  return { dueDate, completionDate: null };
}

export function pickEstimatedEffortMinutes(docNum: string, index: number): number {
  const rng = mulberry32(Number(docNum) * 503 + index * 29);
  return pickWeighted(rng, EFFORT_TIERS);
}

export function shouldAssignEffort(docNum: string, index: number, status: TaskStatus): boolean {
  if (!isOpenStatus(status)) return false;
  const rng = mulberry32(Number(docNum) * 811 + index * 17);
  return rng() < TARGET_DISTRIBUTION.withEffortEstimatePct;
}

export interface OperationalBuckets {
  dueTodayIds: string[];
  blockedIds: string[];
  overdueIds: string[];
  dueThisWeekIds: string[];
  futureIds: string[];
}

/** Assign explicit operational due-date buckets on open project tasks. */
export function planOperationalBuckets(openTaskIds: readonly string[]): OperationalBuckets {
  const sorted = [...openTaskIds].sort();
  let cursor = 0;
  const take = (count: number) => sorted.slice(cursor, (cursor += count));

  const dueTodayIds = take(TARGET_DISTRIBUTION.dueToday.max);
  const blockedIds = take(TARGET_DISTRIBUTION.blocked.max);
  const overdueIds = take(TARGET_DISTRIBUTION.overdueOpen.max);
  const dueThisWeekIds = take(TARGET_DISTRIBUTION.dueThisWeek.max);
  const futureIds = sorted.slice(cursor);

  return { dueTodayIds, blockedIds, overdueIds, dueThisWeekIds, futureIds };
}

export function dueDateForOperationalBucket(
  bucket: keyof OperationalBuckets,
  docNum: string,
  index: number,
): string {
  const rng = mulberry32(Number(docNum) * 401 + index);
  switch (bucket) {
    case 'dueTodayIds':
      return DEMO_TODAY;
    case 'blockedIds':
      return addDaysIso(DEMO_TODAY, -intBetween(rng, 2, 12));
    case 'overdueIds':
      return addDaysIso(DEMO_TODAY, -intBetween(rng, 1, 21));
    case 'dueThisWeekIds':
      return addDaysIso(DEMO_TODAY, intBetween(rng, 1, 6));
    case 'futureIds':
    default:
      return addDaysIso(DEMO_TODAY, intBetween(rng, 8, 35));
  }
}

/** Active projects each technical engineer should appear on in workload.project_count. */
export function projectDocNumsForEmployee(
  employeeKey: (typeof TECHNICAL_EMPLOYEE_KEYS)[number],
  projectSpecs: readonly ProjectSpec[],
  count = 6,
): string[] {
  const active = projectSpecs.filter(
    (spec) => spec.activity !== 'done' && spec.bucket !== 'completed',
  );
  const pool = active.length > 0 ? active : projectSpecs;
  const keyIndex = TECHNICAL_EMPLOYEE_KEYS.indexOf(employeeKey);
  const picked: string[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(pool[(keyIndex * 11 + i * 7) % pool.length]!.docNum);
  }
  return [...new Set(picked)];
}
