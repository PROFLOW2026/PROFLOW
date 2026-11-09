import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import type { BaselineScheduleItem } from '../domain/baseline-snapshot';

type BaselineRow = {
  id: string;
  organization_id: string;
  project_id: string;
  label: string | null;
  created_by_user_id: string | null;
  created_at: Date | string;
};

type SnapshotRow = {
  id: string;
  baseline_id: string;
  organization_id: string;
  project_id: string;
  items: BaselineScheduleItem[] | string;
  created_at: Date | string;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function parseItems(raw: BaselineScheduleItem[] | string): BaselineScheduleItem[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = JSON.parse(raw) as BaselineScheduleItem[];
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

export interface PlanningScheduleBaselineRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly label: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
}

export interface PlanningScheduleBaselineSnapshotRecord {
  readonly id: string;
  readonly baselineId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly items: readonly BaselineScheduleItem[];
  readonly createdAt: Date;
}

export interface LatestBaselineWithSnapshot {
  readonly baseline: PlanningScheduleBaselineRecord;
  readonly snapshot: PlanningScheduleBaselineSnapshotRecord;
}

function mapBaseline(row: BaselineRow): PlanningScheduleBaselineRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    label: row.label,
    createdByUserId: row.created_by_user_id,
    createdAt: asDate(row.created_at),
  };
}

function mapSnapshot(row: SnapshotRow): PlanningScheduleBaselineSnapshotRecord {
  return {
    id: row.id,
    baselineId: row.baseline_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    items: parseItems(row.items),
    createdAt: asDate(row.created_at),
  };
}

export async function findLatestBaselineWithSnapshot(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<LatestBaselineWithSnapshot | null> {
  const result = await db.execute(sql`
    select
      b.id,
      b.organization_id,
      b.project_id,
      b.label,
      b.created_by_user_id,
      b.created_at,
      s.id as snapshot_id,
      s.baseline_id,
      s.items,
      s.created_at as snapshot_created_at
    from public.planning_schedule_baselines b
    join public.planning_schedule_baseline_snapshots s
      on s.baseline_id = b.id
     and s.organization_id = b.organization_id
     and s.project_id = b.project_id
    where b.organization_id = ${organizationId}::uuid
      and b.project_id = ${projectId}::uuid
    order by b.created_at desc
    limit 1
  `);

  const row = rowsOf<{
    id: string;
    organization_id: string;
    project_id: string;
    label: string | null;
    created_by_user_id: string | null;
    created_at: Date | string;
    snapshot_id: string;
    baseline_id: string;
    items: BaselineScheduleItem[] | string;
    snapshot_created_at: Date | string;
  }>(result)[0];

  if (!row) return null;

  return {
    baseline: mapBaseline(row),
    snapshot: mapSnapshot({
      id: row.snapshot_id,
      baseline_id: row.baseline_id,
      organization_id: row.organization_id,
      project_id: row.project_id,
      items: row.items,
      created_at: row.snapshot_created_at,
    }),
  };
}

export interface InsertPlanningBaselineInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly label: string | null;
  readonly createdByUserId: string;
  readonly items: readonly BaselineScheduleItem[];
}

export async function insertPlanningBaselineWithSnapshot(
  db: DbExecutor,
  input: InsertPlanningBaselineInput,
): Promise<LatestBaselineWithSnapshot> {
  const baselineResult = await db.execute(sql`
    insert into public.planning_schedule_baselines (
      organization_id,
      project_id,
      label,
      created_by_user_id
    ) values (
      ${input.organizationId}::uuid,
      ${input.projectId}::uuid,
      ${input.label},
      ${input.createdByUserId}::uuid
    )
    returning
      id,
      organization_id,
      project_id,
      label,
      created_by_user_id,
      created_at
  `);
  const baselineRow = rowsOf<BaselineRow>(baselineResult)[0];
  if (!baselineRow) throw new Error('planning baseline row was not stored');

  const itemsJson = JSON.stringify(input.items);
  const snapshotResult = await db.execute(sql`
    insert into public.planning_schedule_baseline_snapshots (
      baseline_id,
      organization_id,
      project_id,
      items
    ) values (
      ${baselineRow.id}::uuid,
      ${input.organizationId}::uuid,
      ${input.projectId}::uuid,
      ${itemsJson}::jsonb
    )
    returning
      id,
      baseline_id,
      organization_id,
      project_id,
      items,
      created_at
  `);
  const snapshotRow = rowsOf<SnapshotRow>(snapshotResult)[0];
  if (!snapshotRow) throw new Error('planning baseline snapshot was not stored');

  return {
    baseline: mapBaseline(baselineRow),
    snapshot: mapSnapshot(snapshotRow),
  };
}
