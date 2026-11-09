import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import type { ProjectGoalStatus } from '../domain/constants';
import type { ProjectGoalRecord } from '../domain/types';

type GoalRow = {
  id: string;
  organization_id: string;
  project_id: string;
  title: string;
  owner_user_id: string | null;
  due_on: string | Date | null;
  status: string;
  progress_percent: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function asIsoDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapRow(row: GoalRow): ProjectGoalRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    title: row.title,
    ownerUserId: row.owner_user_id,
    dueOn: asIsoDate(row.due_on),
    status: row.status as ProjectGoalStatus,
    progressPercent: Number(row.progress_percent),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

export async function listProjectGoalRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectGoalRecord[]> {
  const result = await db.execute(sql`
    select
      id,
      organization_id,
      project_id,
      title,
      owner_user_id,
      due_on,
      status,
      progress_percent,
      created_at,
      updated_at
    from public.project_goals
    where organization_id = ${organizationId}::uuid
      and project_id = ${projectId}::uuid
    order by due_on nulls last, created_at desc
  `);
  return rowsOf<GoalRow>(result).map(mapRow);
}

export interface InsertProjectGoalRowInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly dueOn: string | null;
  readonly status: ProjectGoalStatus;
  readonly progressPercent: number;
}

export async function insertProjectGoalRow(
  db: DbExecutor,
  input: InsertProjectGoalRowInput,
): Promise<ProjectGoalRecord> {
  const result = await db.execute(sql`
    insert into public.project_goals (
      organization_id,
      project_id,
      title,
      owner_user_id,
      due_on,
      status,
      progress_percent
    ) values (
      ${input.organizationId}::uuid,
      ${input.projectId}::uuid,
      ${input.title},
      ${input.ownerUserId}::uuid,
      ${input.dueOn}::date,
      ${input.status},
      ${input.progressPercent}
    )
    returning
      id,
      organization_id,
      project_id,
      title,
      owner_user_id,
      due_on,
      status,
      progress_percent,
      created_at,
      updated_at
  `);
  const row = rowsOf<GoalRow>(result)[0];
  if (!row) throw new Error('project goal row was not stored');
  return mapRow(row);
}

export async function updateProjectGoalStatusRow(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  goalId: string,
  status: ProjectGoalStatus,
): Promise<ProjectGoalRecord | null> {
  const result = await db.execute(sql`
    update public.project_goals
    set status = ${status}, updated_at = now()
    where organization_id = ${organizationId}::uuid
      and project_id = ${projectId}::uuid
      and id = ${goalId}::uuid
    returning
      id,
      organization_id,
      project_id,
      title,
      owner_user_id,
      due_on,
      status,
      progress_percent,
      created_at,
      updated_at
  `);
  const row = rowsOf<GoalRow>(result)[0];
  return row ? mapRow(row) : null;
}
