import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import type { WorkPermitRecord, WorkPermitStatus } from '../domain/types';
import { sqlFirstRow, sqlRows } from './sql-rows';

type WorkPermitRow = {
  id: string;
  organization_id: string;
  project_id: string;
  title: string;
  permit_type: string;
  status: WorkPermitStatus;
  requested_by_user_id: string | null;
  decided_by_user_id: string | null;
  valid_from: string | Date | null;
  valid_until: string | Date | null;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

let relationReady: boolean | null = null;

function dateOnly(value: string | Date | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function mapRow(row: WorkPermitRow): WorkPermitRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    title: row.title,
    permitType: row.permit_type,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    decidedByUserId: row.decided_by_user_id,
    validFrom: dateOnly(row.valid_from),
    validUntil: dateOnly(row.valid_until),
    notes: row.notes,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

export async function workPermitsRelationReady(db: DbExecutor): Promise<boolean> {
  if (relationReady === true) return true;
  const row = sqlFirstRow<{ present: boolean }>(
    await db.execute(
      sql`select to_regclass('public.work_permits') is not null as present`,
    ),
  );
  const ready = row?.present === true;
  if (ready) relationReady = true;
  return ready;
}

export async function listWorkPermitsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  limit = 200,
): Promise<WorkPermitRecord[]> {
  if (!(await workPermitsRelationReady(db))) return [];
  const rows = sqlRows<WorkPermitRow>(
    await db.execute(sql`
      select *
      from public.work_permits
      where organization_id = ${organizationId}::uuid
        and project_id = ${projectId}::uuid
      order by created_at desc
      limit ${limit}
    `),
  );
  return rows.map(mapRow);
}

export async function findWorkPermitById(
  db: DbExecutor,
  organizationId: string,
  workPermitId: string,
): Promise<WorkPermitRecord | null> {
  if (!(await workPermitsRelationReady(db))) return null;
  const row = sqlFirstRow<WorkPermitRow>(
    await db.execute(sql`
      select *
      from public.work_permits
      where organization_id = ${organizationId}::uuid
        and id = ${workPermitId}::uuid
      limit 1
    `),
  );
  return row ? mapRow(row) : null;
}

export interface InsertWorkPermitInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly permitType: string;
  readonly requestedByUserId: string;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly notes: string | null;
}

export async function insertWorkPermitDraft(
  db: DbExecutor,
  input: InsertWorkPermitInput,
): Promise<WorkPermitRecord> {
  const row = sqlFirstRow<WorkPermitRow>(
    await db.execute(sql`
      insert into public.work_permits (
        organization_id,
        project_id,
        title,
        permit_type,
        status,
        requested_by_user_id,
        valid_from,
        valid_until,
        notes
      )
      values (
        ${input.organizationId}::uuid,
        ${input.projectId}::uuid,
        ${input.title},
        ${input.permitType},
        'draft',
        ${input.requestedByUserId}::uuid,
        ${input.validFrom}::date,
        ${input.validUntil}::date,
        ${input.notes}
      )
      returning *
    `),
  );
  if (!row) throw new Error('work_permits insert returned no row');
  return mapRow(row);
}

export async function updateWorkPermitStatus(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly workPermitId: string;
    readonly status: WorkPermitStatus;
    readonly decidedByUserId?: string;
  },
): Promise<WorkPermitRecord | null> {
  const row = sqlFirstRow<WorkPermitRow>(
    input.decidedByUserId
      ? await db.execute(sql`
          update public.work_permits
          set
            status = ${input.status},
            decided_by_user_id = ${input.decidedByUserId}::uuid,
            updated_at = now()
          where organization_id = ${input.organizationId}::uuid
            and id = ${input.workPermitId}::uuid
          returning *
        `)
      : await db.execute(sql`
          update public.work_permits
          set status = ${input.status}, updated_at = now()
          where organization_id = ${input.organizationId}::uuid
            and id = ${input.workPermitId}::uuid
          returning *
        `),
  );
  return row ? mapRow(row) : null;
}
