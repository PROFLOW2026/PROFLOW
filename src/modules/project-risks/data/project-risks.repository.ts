import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import type { ProjectRiskStatus } from '../domain/constants';
import { projectRiskScore } from '../domain/score';
import type { ProjectRiskRecord } from '../domain/types';

type RiskRow = {
  id: string;
  organization_id: string;
  project_id: string;
  description: string;
  probability: number;
  impact: number;
  owner_user_id: string | null;
  treatment: string | null;
  status: string;
  review_on: string | Date | null;
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

function mapRow(row: RiskRow): ProjectRiskRecord {
  const probability = Number(row.probability);
  const impact = Number(row.impact);
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    description: row.description,
    probability,
    impact,
    score: projectRiskScore(probability, impact),
    ownerUserId: row.owner_user_id,
    treatment: row.treatment,
    status: row.status as ProjectRiskStatus,
    reviewOn: asIsoDate(row.review_on),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

export async function listProjectRiskRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectRiskRecord[]> {
  const result = await db.execute(sql`
    select
      id,
      organization_id,
      project_id,
      description,
      probability,
      impact,
      owner_user_id,
      treatment,
      status,
      review_on,
      created_at,
      updated_at
    from public.project_risks
    where organization_id = ${organizationId}::uuid
      and project_id = ${projectId}::uuid
    order by (probability * impact) desc, created_at desc
  `);
  return rowsOf<RiskRow>(result).map(mapRow);
}

export async function findProjectRiskRow(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  riskId: string,
): Promise<ProjectRiskRecord | null> {
  const result = await db.execute(sql`
    select
      id,
      organization_id,
      project_id,
      description,
      probability,
      impact,
      owner_user_id,
      treatment,
      status,
      review_on,
      created_at,
      updated_at
    from public.project_risks
    where organization_id = ${organizationId}::uuid
      and project_id = ${projectId}::uuid
      and id = ${riskId}::uuid
    limit 1
  `);
  const row = rowsOf<RiskRow>(result)[0];
  return row ? mapRow(row) : null;
}

export interface InsertProjectRiskRowInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly description: string;
  readonly probability: number;
  readonly impact: number;
  readonly ownerUserId: string | null;
  readonly treatment: string | null;
  readonly status: ProjectRiskStatus;
  readonly reviewOn: string | null;
}

export async function insertProjectRiskRow(
  db: DbExecutor,
  input: InsertProjectRiskRowInput,
): Promise<ProjectRiskRecord> {
  const result = await db.execute(sql`
    insert into public.project_risks (
      organization_id,
      project_id,
      description,
      probability,
      impact,
      owner_user_id,
      treatment,
      status,
      review_on
    ) values (
      ${input.organizationId}::uuid,
      ${input.projectId}::uuid,
      ${input.description},
      ${input.probability},
      ${input.impact},
      ${input.ownerUserId}::uuid,
      ${input.treatment},
      ${input.status},
      ${input.reviewOn}::date
    )
    returning
      id,
      organization_id,
      project_id,
      description,
      probability,
      impact,
      owner_user_id,
      treatment,
      status,
      review_on,
      created_at,
      updated_at
  `);
  const row = rowsOf<RiskRow>(result)[0];
  if (!row) throw new Error('project risk row was not stored');
  return mapRow(row);
}

export async function updateProjectRiskStatusRow(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  riskId: string,
  status: ProjectRiskStatus,
): Promise<ProjectRiskRecord | null> {
  const result = await db.execute(sql`
    update public.project_risks
    set status = ${status}, updated_at = now()
    where organization_id = ${organizationId}::uuid
      and project_id = ${projectId}::uuid
      and id = ${riskId}::uuid
    returning
      id,
      organization_id,
      project_id,
      description,
      probability,
      impact,
      owner_user_id,
      treatment,
      status,
      review_on,
      created_at,
      updated_at
  `);
  const row = rowsOf<RiskRow>(result)[0];
  return row ? mapRow(row) : null;
}
