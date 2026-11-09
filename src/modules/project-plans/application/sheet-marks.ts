import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { PROJECT_CAPABILITIES, assertProjectCapability, loadProjectCapabilities } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findRevision } from '../data/plans.repository';
import { parseOrThrow, uuid } from './shared';

export const SHEET_MARK_KINDS = ['pin', 'note', 'measure'] as const;
export type SheetMarkKind = (typeof SHEET_MARK_KINDS)[number];

export interface SheetMarkView {
  readonly id: string;
  readonly drawingRevisionId: string;
  readonly pageIndex: number;
  readonly kind: SheetMarkKind;
  readonly geometry: Record<string, unknown>;
  readonly note: string | null;
  readonly linkedEntityType: string | null;
  readonly linkedEntityId: string | null;
  readonly createdAt: string;
}

function rowsFromExecute(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[];
}

function mapSheetMarkRow(row: Record<string, unknown>): SheetMarkView {
  return {
    id: String(row.id),
    drawingRevisionId: String(row.drawing_revision_id),
    pageIndex: Number(row.page_index),
    kind: String(row.kind) as SheetMarkKind,
    geometry:
      typeof row.geometry === 'object' && row.geometry !== null
        ? (row.geometry as Record<string, unknown>)
        : {},
    note: row.note != null ? String(row.note) : null,
    linkedEntityType: row.linked_entity_type != null ? String(row.linked_entity_type) : null,
    linkedEntityId: row.linked_entity_id != null ? String(row.linked_entity_id) : null,
    createdAt: String(row.created_at),
  };
}

async function loadRevisionForView(context: OrgContext, revisionId: string) {
  const revision = await findRevision(context.db, context.organizationId, uuid.parse(revisionId));
  if (!revision) throw new NotFoundError('Revision');
  await assertProjectCapability(context, revision.projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  return revision;
}

async function assertCanCreateSheetMark(context: OrgContext, projectId: string): Promise<void> {
  const capabilities = await loadProjectCapabilities(context, projectId);
  if (capabilities.has(PROJECT_CAPABILITIES.DOCUMENTS_SHARE)) return;
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
}

const listSchema = z.object({
  revisionId: uuid,
  pageIndex: z.number().int().min(0).optional(),
});

export async function listDrawingSheetMarks(
  context: OrgContext,
  raw: z.input<typeof listSchema>,
): Promise<readonly SheetMarkView[]> {
  const input = parseOrThrow(listSchema, raw);
  await loadRevisionForView(context, input.revisionId);
  const result = await context.db.execute(
    input.pageIndex != null
      ? sql`
          SELECT
            id,
            drawing_revision_id,
            page_index,
            kind,
            geometry,
            note,
            linked_entity_type,
            linked_entity_id,
            created_at
          FROM public.drawing_sheet_marks
          WHERE organization_id = ${context.organizationId}::uuid
            AND drawing_revision_id = ${input.revisionId}::uuid
            AND page_index = ${input.pageIndex}
          ORDER BY created_at ASC
        `
      : sql`
          SELECT
            id,
            drawing_revision_id,
            page_index,
            kind,
            geometry,
            note,
            linked_entity_type,
            linked_entity_id,
            created_at
          FROM public.drawing_sheet_marks
          WHERE organization_id = ${context.organizationId}::uuid
            AND drawing_revision_id = ${input.revisionId}::uuid
          ORDER BY page_index ASC, created_at ASC
        `,
  );
  return rowsFromExecute(result).map(mapSheetMarkRow);
}

const normalizedPoint = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

const pointGeometrySchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

const measureGeometrySchema = z.object({
  points: z.tuple([normalizedPoint, normalizedPoint]),
  scale: z.number().positive().finite(),
  unit: z.literal('m'),
});

const createSchema = z.object({
  projectId: uuid,
  drawingRevisionId: uuid,
  pageIndex: z.number().int().min(0),
  kind: z.enum(SHEET_MARK_KINDS),
  geometry: z.record(z.string(), z.unknown()),
  note: z.string().trim().max(4000).nullish(),
  linkedEntityType: z.literal('boq_node').nullish(),
  linkedEntityId: uuid.nullish(),
});

export async function createDrawingSheetMark(
  context: OrgContext,
  raw: z.input<typeof createSchema>,
): Promise<{ markId: string }> {
  const input = parseOrThrow(createSchema, raw);
  const revision = await loadRevisionForView(context, input.drawingRevisionId);
  if (revision.projectId !== input.projectId) throw new NotFoundError('Revision');
  await assertCanCreateSheetMark(context, revision.projectId);

  const geometry =
    input.kind === 'measure'
      ? measureGeometrySchema.parse(input.geometry)
      : pointGeometrySchema.parse(input.geometry);

  const markId = randomUUID();
  const geometryJson = JSON.stringify(geometry);
  await context.db.execute(sql`
    INSERT INTO public.drawing_sheet_marks (
      id,
      organization_id,
      project_id,
      drawing_revision_id,
      page_index,
      kind,
      geometry,
      note,
      linked_entity_type,
      linked_entity_id,
      created_by_user_id
    )
    VALUES (
      ${markId}::uuid,
      ${context.organizationId}::uuid,
      ${input.projectId}::uuid,
      ${input.drawingRevisionId}::uuid,
      ${input.pageIndex},
      ${input.kind},
      ${geometryJson}::jsonb,
      ${input.note ?? null},
      ${input.linkedEntityType ?? null},
      ${input.linkedEntityId != null ? sql`${input.linkedEntityId}::uuid` : sql`NULL`},
      ${context.userId}::uuid
    )
  `);
  return { markId };
}

const deleteSchema = z.object({
  projectId: uuid,
  markId: uuid,
});

export async function deleteDrawingSheetMark(
  context: OrgContext,
  raw: z.input<typeof deleteSchema>,
): Promise<void> {
  const input = parseOrThrow(deleteSchema, raw);
  const result = await context.db.execute(sql`
    SELECT project_id
    FROM public.drawing_sheet_marks
    WHERE organization_id = ${context.organizationId}::uuid
      AND id = ${input.markId}::uuid
    LIMIT 1
  `);
  const rows = rowsFromExecute(result);
  const projectId = rows[0]?.project_id != null ? String(rows[0].project_id) : null;
  if (!projectId || projectId !== input.projectId) throw new NotFoundError('Mark');
  await assertCanCreateSheetMark(context, projectId);
  await context.db.execute(sql`
    DELETE FROM public.drawing_sheet_marks
    WHERE organization_id = ${context.organizationId}::uuid
      AND id = ${input.markId}::uuid
  `);
}
