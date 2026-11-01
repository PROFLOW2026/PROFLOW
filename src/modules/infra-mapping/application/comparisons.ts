import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { beginExternalEvidenceUpload, beginInternalEvidenceUpload } from '@/modules/evidence';
import {
  findCaptureRow,
  findComparisonByClientId,
  findComparisonRow,
  insertComparison,
  listComparisonRows,
  listEvidenceBriefs,
  listLocationNodes,
  toComparisonDto,
  updateComparisonRow,
} from '../data/infra.repository';
import { comparisonSidecarName } from '../domain/folder-naming';
import { subtreeIds } from '../domain/filters';
import type { InfraComparisonDto } from '../domain/types';
import { beginComparisonSchema, type BeginComparisonInput } from '../domain/validation';
import {
  actorDb,
  actorPrincipalId,
  actorUserId,
  authorizeLocation,
  authorizeProject,
  isAuthor,
  organizationFor,
} from './access';
import { assertTaskUsable, beginCapture } from './captures';
import { INFRA_ENTITY_TYPE, uploadUrlFor, type InfraActor, type InfraDeps } from './ports';

/** Deterministic uuid so a retried save re-uses the same capture / evidence instead of duplicating. */
export function deriveClientId(base: string, slot: string): string {
  const hash = createHash('sha1').update(`${base}:${slot}`).digest('hex');
  const variant = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variant}${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
}

export type ComparisonSlot = 'before' | 'after' | 'result';

export interface ComparisonUpload {
  readonly slot: ComparisonSlot;
  readonly evidenceId: string;
  readonly uploadUrl: string;
  readonly alreadyUploaded: boolean;
}

export interface BeginComparisonResult {
  readonly comparisonId: string;
  readonly uploads: readonly ComparisonUpload[];
}

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  }
  return result.data;
}

/**
 * Step 1 of an EXPLICIT save of a locating result (the UI only calls this after the user chose
 * "save"). Registers the files the user chose to keep (before photo / after photo / the overlay
 * snapshot) plus the alignment data, and returns upload tickets. Nothing is saved implicitly.
 */
export async function beginComparisonSave(actor: InfraActor, raw: BeginComparisonInput, deps: InfraDeps): Promise<BeginComparisonResult> {
  const input = parse(beginComparisonSchema, raw);
  const organizationId = await organizationFor(actor, input.organizationId);
  const access = await authorizeLocation(actor, {
    organizationId,
    projectId: input.projectId,
    locationId: input.locationId,
    need: 'document',
  });
  const db = actorDb(actor);
  const uploads: ComparisonUpload[] = [];
  await assertTaskUsable(actor, { organizationId, projectId: access.projectId, taskId: input.taskId });

  const existing = await findComparisonByClientId(db, organizationId, input.clientComparisonId);
  if (existing && (!isAuthor(actor, existing) || existing.projectId !== access.projectId || existing.locationId !== input.locationId)) {
    throw new NotFoundError('Comparison');
  }
  if (existing?.removedAt) throw new ConflictError('Comparison was removed', 'infraMapping.errors.comparisonRemoved');

  let beforeCaptureId = existing?.beforeCaptureId ?? input.beforeCaptureId ?? null;
  let afterCaptureId = existing?.afterCaptureId ?? null;

  if (beforeCaptureId && !existing) {
    const before = await findCaptureRow(db, organizationId, beforeCaptureId);
    if (!before || before.removedAt || before.projectId !== access.projectId) throw new NotFoundError('Capture');
  }

  if (input.files.before && !beforeCaptureId) {
    const result = await beginCapture(
      actor,
      {
        projectId: input.projectId,
        organizationId,
        locationId: input.locationId,
        clientCaptureId: deriveClientId(input.clientComparisonId, 'before'),
        taskId: input.taskId ?? null,
        source: 'gallery',
        file: input.files.before,
        details: { role: 'documentation' },
      },
      deps,
    );
    beforeCaptureId = result.captureId;
    uploads.push({ slot: 'before', evidenceId: result.evidenceId, uploadUrl: result.uploadUrl, alreadyUploaded: result.alreadyUploaded });
  } else if (input.files.before && beforeCaptureId && existing?.beforeCaptureId) {
    const again = await beginCapture(
      actor,
      {
        projectId: input.projectId,
        organizationId,
        locationId: input.locationId,
        clientCaptureId: deriveClientId(input.clientComparisonId, 'before'),
        file: input.files.before,
        details: { role: 'documentation' },
      },
      deps,
    );
    uploads.push({ slot: 'before', evidenceId: again.evidenceId, uploadUrl: again.uploadUrl, alreadyUploaded: again.alreadyUploaded });
  }

  if (input.files.after) {
    const result = await beginCapture(
      actor,
      {
        projectId: input.projectId,
        organizationId,
        locationId: input.locationId,
        clientCaptureId: deriveClientId(input.clientComparisonId, 'after'),
        taskId: input.taskId ?? null,
        source: 'camera',
        file: input.files.after,
        details: { ...(input.afterDetails ?? {}), role: 'after_closure' },
      },
      deps,
    );
    afterCaptureId = result.captureId;
    uploads.push({ slot: 'after', evidenceId: result.evidenceId, uploadUrl: result.uploadUrl, alreadyUploaded: result.alreadyUploaded });
  }

  let resultEvidenceId = existing?.resultEvidenceId ?? null;
  if (input.files.result && !resultEvidenceId) {
    const ticket =
      actor.kind === 'internal'
        ? await beginInternalEvidenceUpload(
            actor.context,
            {
              entityType: INFRA_ENTITY_TYPE,
              entityId: input.locationId,
              projectId: access.projectId,
              fileName: `comparison-${input.clientComparisonId.slice(0, 8)}.jpg`,
              mimeType: 'image/jpeg',
              sizeBytes: input.files.result.sizeBytes,
              locationId: input.locationId,
              accept: ['photo'],
            },
            deps.files,
          )
        : await beginExternalEvidenceUpload(
            actor.context,
            {
              organizationId,
              entityType: INFRA_ENTITY_TYPE,
              entityId: input.locationId,
              projectId: access.projectId,
              fileName: `comparison-${input.clientComparisonId.slice(0, 8)}.jpg`,
              mimeType: 'image/jpeg',
              sizeBytes: input.files.result.sizeBytes,
              locationId: input.locationId,
              accept: ['photo'],
            },
            deps.files,
          );
    resultEvidenceId = ticket.evidenceId;
    uploads.push({ slot: 'result', evidenceId: ticket.evidenceId, uploadUrl: uploadUrlFor(actor, ticket.evidenceId), alreadyUploaded: false });
  } else if (resultEvidenceId) {
    const [brief] = await listEvidenceBriefs(db, organizationId, [resultEvidenceId]);
    if (brief && brief.status === 'pending') {
      uploads.push({ slot: 'result', evidenceId: resultEvidenceId, uploadUrl: uploadUrlFor(actor, resultEvidenceId), alreadyUploaded: false });
    }
  }

  if (existing) {
    await updateComparisonRow(db, organizationId, existing.id, { beforeCaptureId, afterCaptureId, resultEvidenceId });
    return { comparisonId: existing.id, uploads };
  }

  const comparisonId = crypto.randomUUID();
  await insertComparison(db, {
    id: comparisonId,
    organizationId,
    projectId: access.projectId,
    locationId: input.locationId,
    taskId: input.taskId ?? null,
    clientComparisonId: input.clientComparisonId,
    mode: input.mode,
    beforeCaptureId,
    afterCaptureId,
    resultEvidenceId,
    alignment: input.alignment as unknown as Record<string, unknown>,
    alignmentKind: input.alignment.kind,
    reliable: input.reliable,
    note: input.note,
    createdByActorType: actor.kind,
    createdByUserId: actorUserId(actor),
    createdByPrincipalId: actorPrincipalId(actor),
    vendorId: access.vendorId,
  });
  return { comparisonId, uploads };
}

/**
 * Step 3: every chosen file reached the cloud -> write the sidecar JSON (alignment + references)
 * into the location's folder so the result can always be reopened from the customer's own storage.
 */
export async function finalizeComparisonSave(
  actor: InfraActor,
  raw: { comparisonId: string; organizationId?: string | null },
  deps: InfraDeps,
): Promise<InfraComparisonDto> {
  const comparisonId = z.string().uuid().parse(raw.comparisonId);
  const organizationId = await organizationFor(actor, raw.organizationId);
  const db = actorDb(actor);
  const row = await findComparisonRow(db, organizationId, comparisonId);
  if (!row || row.removedAt || !isAuthor(actor, row)) throw new NotFoundError('Comparison');
  await authorizeLocation(actor, { organizationId, projectId: row.projectId, locationId: row.locationId, need: 'document' });

  const captureIds = [row.beforeCaptureId, row.afterCaptureId].filter((id): id is string => Boolean(id));
  const captures = await Promise.all(captureIds.map((id) => findCaptureRow(db, organizationId, id)));
  const evidenceIds = [...captures.map((capture) => capture?.evidenceId), row.resultEvidenceId].filter((id): id is string => Boolean(id));
  const briefs = await listEvidenceBriefs(db, organizationId, evidenceIds);
  const pending = briefs.filter((brief) => brief.status !== 'available');
  if (pending.length > 0 || briefs.length < evidenceIds.length) {
    throw new DomainRuleError('Not every file was uploaded', 'infraMapping.errors.uploadIncomplete');
  }

  const evidenceOf = (captureId: string | null) => captures.find((capture) => capture?.id === captureId)?.evidenceId ?? null;
  const sidecarName = comparisonSidecarName(row.id);
  const sidecar = await deps.folders.writeSidecar({
    organizationId,
    projectId: row.projectId,
    locationId: row.locationId,
    fileName: sidecarName,
    json: JSON.stringify(
      {
        schema: 'projectflow.infra-comparison',
        version: 1,
        comparisonId: row.id,
        mode: row.mode,
        projectId: row.projectId,
        locationId: row.locationId,
        createdAt: row.createdAt.toISOString(),
        reliable: row.reliable,
        alignmentKind: row.alignmentKind,
        alignment: row.alignment,
        before: row.beforeCaptureId ? { captureId: row.beforeCaptureId, evidenceId: evidenceOf(row.beforeCaptureId) } : null,
        after: row.afterCaptureId ? { captureId: row.afterCaptureId, evidenceId: evidenceOf(row.afterCaptureId) } : null,
        resultEvidenceId: row.resultEvidenceId,
        note: row.note,
      },
      null,
      2,
    ),
  });
  await updateComparisonRow(db, organizationId, row.id, {
    sidecarConnectionId: sidecar.connectionId,
    sidecarExternalFileId: sidecar.externalFileId,
    sidecarFileName: sidecarName,
  });
  const fresh = await findComparisonRow(db, organizationId, row.id);
  if (!fresh) throw new NotFoundError('Comparison');
  const map = new Map<string, string>();
  for (const capture of captures) if (capture) map.set(capture.id, capture.evidenceId);
  return toComparisonDto(fresh, map, { actorType: fresh.createdByActorType, userName: null, principalName: null });
}

export async function listComparisons(
  actor: InfraActor,
  raw: { projectId: string; organizationId?: string | null; locationId?: string | null; taskId?: string | null; limit?: number },
): Promise<InfraComparisonDto[]> {
  const projectId = z.string().uuid().parse(raw.projectId);
  const organizationId = await organizationFor(actor, raw.organizationId);
  const access = await authorizeProject(actor, { organizationId, projectId, need: 'view' });
  const db = actorDb(actor);
  let locationIds: string[] | undefined;
  if (raw.locationId) {
    const nodes = await listLocationNodes(db, organizationId, access.projectId);
    locationIds = subtreeIds(
      nodes.map((node) => ({ id: node.id, parentId: node.parentId, name: node.name, code: node.code })),
      raw.locationId,
    );
  }
  const items = await listComparisonRows(db, {
    organizationId,
    projectId: access.projectId,
    locationIds,
    taskId: raw.taskId ?? undefined,
    limit: Math.min(Math.max(raw.limit ?? 30, 1), 60),
  });
  // Only comparisons whose files finished uploading are offered for reopening.
  return items.filter((item) => item.sidecarFileName !== null);
}

export async function removeComparison(
  actor: InfraActor,
  raw: { comparisonId: string; organizationId?: string | null },
): Promise<void> {
  const comparisonId = z.string().uuid().parse(raw.comparisonId);
  const organizationId = await organizationFor(actor, raw.organizationId);
  const db = actorDb(actor);
  const row = await findComparisonRow(db, organizationId, comparisonId);
  if (!row || row.removedAt) throw new NotFoundError('Comparison');
  const access = await authorizeLocation(actor, { organizationId, projectId: row.projectId, locationId: row.locationId, need: 'document' });
  if (!isAuthor(actor, row) && !access.canManageCaptures) throw new NotFoundError('Comparison');
  if (!(await updateComparisonRow(db, organizationId, row.id, { removedAt: new Date() }))) throw new NotFoundError('Comparison');
}
