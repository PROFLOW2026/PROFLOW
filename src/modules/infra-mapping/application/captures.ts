import { z } from 'zod';
import {
  beginExternalEvidenceUpload,
  beginInternalEvidenceUpload,
  removeExternalEvidence,
  removeInternalEvidence,
  type EvidenceUploadTicket,
} from '@/modules/evidence';
import { buildLocationIndex, isLocationType } from '@/modules/project-profile/domain/locations';
import { levelScopeIds, validateSpaceLevel } from '@/modules/project-profile/domain/unit-levels';
import { AuthorizationError, ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  captureEvidenceIds,
  findCaptureByClientId,
  findCaptureJoin,
  findCaptureRow,
  insertCapture,
  insertMarkings,
  insertVersion,
  latestAnnotatedByCapture,
  listCaptureRows,
  listDistinctDescriptors,
  listEvidenceBriefs,
  listLatestMarkings,
  listLocationNodes,
  listVersionRows,
  maxVersionNumber,
  syncEvidenceLocation,
  taskBelongsToProject,
  toCaptureDto,
  updateCaptureRow,
  type CapturePatch,
} from '../data/infra.repository';
import { annotatedFileName, infraPhotoFileName } from '../domain/folder-naming';
import {
  dayRange,
  decodeCursor,
  encodeCursor,
  infraTypesMatchingText,
  locationIdsMatchingText,
  subtreeIds,
} from '../domain/filters';
import { markingGeometry } from '../domain/markings';
import type { InfraCaptureDetailDto, InfraCaptureDto, InfraListPage } from '../domain/types';
import {
  beginCaptureSchema,
  listCapturesSchema,
  saveMarkingsSchema,
  updateCaptureSchema,
  type BeginCaptureInput,
  type ListCapturesInput,
  type SaveMarkingsInput,
  type UpdateCaptureInput,
} from '../domain/validation';
import {
  actorDb,
  actorPrincipalId,
  actorUserId,
  assertCanEditCapture,
  authorizeLocation,
  authorizeProject,
  isAuthor,
  organizationFor,
  type InfraAccess,
} from './access';
import { INFRA_ENTITY_TYPE, uploadUrlFor, type InfraActor, type InfraDeps } from './ports';

const MIME_EXTENSION: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
};

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  }
  return result.data;
}

function normalizeMime(raw: string | null | undefined): string {
  const mime = (raw ?? '').split(';')[0]!.trim().toLowerCase();
  if (mime === 'image/jpg' || mime === 'image/pjpeg') return 'image/jpeg';
  return mime;
}

export async function assertLocationUsable(
  actor: InfraActor,
  input: { organizationId: string; projectId: string; locationId: string },
): Promise<void> {
  const nodes = await listLocationNodes(actorDb(actor), input.organizationId, input.projectId);
  const node = nodes.find((candidate) => candidate.id === input.locationId);
  if (!node) throw new NotFoundError('Location');
  if (node.archived || !node.isActive) {
    throw new DomainRuleError('Location is archived', 'infraMapping.errors.locationArchived');
  }
}

/**
 * A capture may carry the level of a multi-level unit it belongs to. The level must be a live level of the same
 * building as the location (null / undefined = no level: the location tree decides, as for older captures).
 */
export async function assertLevelUsable(
  actor: InfraActor,
  input: { organizationId: string; projectId: string; locationId: string; levelId: string | null | undefined },
): Promise<void> {
  if (!input.levelId) return;
  const nodes = await listLocationNodes(actorDb(actor), input.organizationId, input.projectId);
  const index = buildLocationIndex(nodes.map((node) => ({ ...node, type: isLocationType(node.type) ? node.type : 'other' })));
  if (validateSpaceLevel(index, input.locationId, input.levelId) !== null) {
    throw new DomainRuleError('Level does not belong to this location', 'projectProfile.errors.levelLink');
  }
}

/** The task must belong to this organization AND project (the DB trigger enforces the same rule). */
export async function assertTaskUsable(
  actor: InfraActor,
  input: { organizationId: string; projectId: string; taskId: string | null | undefined },
): Promise<void> {
  if (!input.taskId) return;
  if (!(await taskBelongsToProject(actorDb(actor), input.organizationId, input.projectId, input.taskId))) {
    throw new NotFoundError('Task');
  }
}

export interface BeginCaptureResult {
  readonly captureId: string;
  readonly evidenceId: string;
  readonly uploadUrl: string;
  /** True when this capture was already uploaded (a retry of a finished upload). */
  readonly alreadyUploaded: boolean;
}

export async function beginEvidence(
  actor: InfraActor,
  access: InfraAccess,
  input: {
    projectId: string;
    locationId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    visibility?: 'internal' | 'contractor' | null;
    /** Evidence kinds accepted for this capture. Photos by default; videos are opted into explicitly. */
    accept?: readonly ('photo' | 'video' | 'document')[];
  },
  deps: InfraDeps,
): Promise<EvidenceUploadTicket> {
  const common = {
    entityType: INFRA_ENTITY_TYPE,
    entityId: input.locationId,
    projectId: input.projectId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    locationId: input.locationId,
    accept: [...(input.accept ?? ['photo'])] as ('photo' | 'video' | 'document')[],
  };
  if (actor.kind === 'internal') {
    return beginInternalEvidenceUpload(actor.context, { ...common, visibility: input.visibility ?? null }, deps.files);
  }
  return beginExternalEvidenceUpload(actor.context, { ...common, organizationId: access.organizationId }, deps.files);
}

/**
 * Registers a capture and returns the upload ticket. Called ONLY after the user approved the photo
 * (the client queue never reaches this step for an unapproved photo). Idempotent on
 * `clientCaptureId`, so a retry after a network failure never creates a second capture.
 * Only the location is mandatory.
 */
export async function beginCapture(actor: InfraActor, raw: BeginCaptureInput, deps: InfraDeps): Promise<BeginCaptureResult> {
  const input = parse(beginCaptureSchema, raw);
  const organizationId = await organizationFor(actor, input.organizationId);
  const access = await authorizeLocation(actor, {
    organizationId,
    projectId: input.projectId,
    locationId: input.locationId,
    need: 'document',
  });
  const db = actorDb(actor);

  const existing = await findCaptureByClientId(db, organizationId, input.clientCaptureId);
  if (existing) {
    if (!isAuthor(actor, existing) || existing.projectId !== access.projectId) throw new NotFoundError('Capture');
    const [brief] = await listEvidenceBriefs(db, organizationId, [existing.evidenceId]);
    if (!brief || brief.status === 'removed') throw new ConflictError('Capture was removed', 'infraMapping.errors.captureRemoved');
    return {
      captureId: existing.id,
      evidenceId: existing.evidenceId,
      uploadUrl: uploadUrlFor(actor, existing.evidenceId),
      alreadyUploaded: brief.status === 'available',
    };
  }

  await assertLocationUsable(actor, { organizationId, projectId: access.projectId, locationId: input.locationId });
  await assertTaskUsable(actor, { organizationId, projectId: access.projectId, taskId: input.taskId });
  await assertLevelUsable(actor, { organizationId, projectId: access.projectId, locationId: input.locationId, levelId: input.levelId });

  const mimeType = normalizeMime(input.file.mimeType);
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
  const safeCapturedAt = Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 5 * 60_000 ? new Date() : capturedAt;
  const ticket = await beginEvidence(
    actor,
    access,
    {
      projectId: access.projectId,
      locationId: input.locationId,
      fileName: infraPhotoFileName({
        capturedAt: safeCapturedAt,
        clientCaptureId: input.clientCaptureId,
        extension: MIME_EXTENSION[mimeType] ?? 'jpg',
      }),
      mimeType,
      sizeBytes: input.file.sizeBytes,
      visibility: input.visibility ?? null,
    },
    deps,
  );

  const captureId = crypto.randomUUID();
  await insertCapture(db, {
    id: captureId,
    organizationId,
    projectId: access.projectId,
    locationId: input.locationId,
    levelId: input.levelId ?? null,
    evidenceId: ticket.evidenceId,
    taskId: input.taskId ?? null,
    clientCaptureId: input.clientCaptureId,
    role: input.details.role,
    source: input.source,
    description: input.details.description,
    room: input.details.room,
    wall: input.details.wall,
    infraType: input.details.infraType,
    dimensions: input.details.dimensions,
    note: input.details.note,
    capturedAt: safeCapturedAt,
    createdByActorType: actor.kind,
    createdByUserId: actorUserId(actor),
    createdByPrincipalId: actorPrincipalId(actor),
    vendorId: access.vendorId,
  });
  return {
    captureId,
    evidenceId: ticket.evidenceId,
    uploadUrl: uploadUrlFor(actor, ticket.evidenceId),
    alreadyUploaded: false,
  };
}

// ── reading ─────────────────────────────────────────────────────────────────────────────────────

export async function listCaptures(actor: InfraActor, raw: ListCapturesInput): Promise<InfraListPage<InfraCaptureDto>> {
  const input = parse(listCapturesSchema, raw);
  const organizationId = await organizationFor(actor, input.organizationId);
  const access = await authorizeProject(actor, { organizationId, projectId: input.projectId, need: 'view' });
  const db = actorDb(actor);

  const nodes = await listLocationNodes(db, organizationId, access.projectId);
  const tree = nodes.map((node) => ({ id: node.id, parentId: node.parentId, name: node.name, code: node.code }));

  let locationIds: string[] | undefined;
  if (input.locationId) {
    if (!nodes.some((node) => node.id === input.locationId)) throw new NotFoundError('Location');
    locationIds = input.includeSubLocations ? subtreeIds(tree, input.locationId) : [input.locationId];
  }
  let level: { id: string; fallbackLocationIds: string[] } | undefined;
  if (input.levelId) {
    if (!nodes.some((node) => node.id === input.levelId)) throw new NotFoundError('Location');
    // Levels are metadata (no folder per level). A capture saved with a level belongs to exactly that level; older
    // captures (no level saved) fall back to the location tree, as before.
    const scope = levelScopeIds(buildLocationIndex(nodes.map((node) => ({ ...node, type: isLocationType(node.type) ? node.type : 'other' }))), input.levelId);
    level = { id: input.levelId, fallbackLocationIds: scope };
  }
  // A contractor limited to specific units only ever lists captures of those locations.
  if (access.allowedLocationIds) {
    const allowed = access.allowedLocationIds;
    locationIds = locationIds ? locationIds.filter((id) => allowed.has(id)) : [...allowed];
  }
  const text = input.text?.trim() || undefined;
  const range = dayRange(input.from, input.to);
  const limit = input.limit;

  const rows = await listCaptureRows(db, {
    organizationId,
    projectId: access.projectId,
    locationIds,
    level,
    text,
    textLocationIds: text ? locationIdsMatchingText(tree, text) : undefined,
    textInfraTypes: text ? infraTypesMatchingText(text) : undefined,
    room: input.room?.trim() || undefined,
    wall: input.wall?.trim() || undefined,
    infraType: input.infraType ?? undefined,
    role: input.role ?? undefined,
    media: input.media ?? undefined,
    taskId: input.taskId ?? undefined,
    from: range.from,
    toExclusive: range.toExclusive,
    createdByUserId: input.mineOnly && actor.kind === 'internal' ? actor.context.userId : undefined,
    createdByPrincipalId: input.mineOnly && actor.kind === 'external' ? actor.context.principalId : undefined,
    cursor: decodeCursor(input.cursor),
    limit: limit + 1,
  });
  const page = rows.slice(0, limit);
  const annotated = await latestAnnotatedByCapture(db, organizationId, page.map((row) => row.id));
  const items = page.map((row) => toCaptureDto(row, annotated.get(row.id) ?? null, access.canManageCaptures || isAuthor(actor, row)));
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.capturedAt, last.id) : null };
}

export async function getCaptureDetail(
  actor: InfraActor,
  raw: { captureId: string; organizationId?: string | null },
): Promise<InfraCaptureDetailDto> {
  const captureId = z.string().uuid().parse(raw.captureId);
  const organizationId = await organizationFor(actor, raw.organizationId);
  const db = actorDb(actor);
  const row = await findCaptureJoin(db, organizationId, captureId);
  if (!row) throw new NotFoundError('Capture');
  const access = await authorizeLocation(actor, {
    organizationId,
    projectId: row.projectId,
    locationId: row.locationId,
    need: 'view',
  });
  const [versions, annotated] = await Promise.all([
    listVersionRows(db, organizationId, captureId),
    latestAnnotatedByCapture(db, organizationId, [captureId]),
  ]);
  const latest = versions[0] ?? null;
  const markings = latest ? await listLatestMarkings(db, organizationId, captureId, latest.id) : [];
  return {
    ...toCaptureDto(row, annotated.get(captureId) ?? null, access.canManageCaptures || isAuthor(actor, row)),
    versions,
    markings,
  };
}

/** Suggestions for the room / wall inputs. */
export async function loadDescriptorSuggestions(
  actor: InfraActor,
  raw: { projectId: string; organizationId?: string | null },
): Promise<{ rooms: string[]; walls: string[] }> {
  const organizationId = await organizationFor(actor, raw.organizationId);
  const access = await authorizeProject(actor, { organizationId, projectId: raw.projectId, need: 'view' });
  return listDistinctDescriptors(actorDb(actor), organizationId, access.projectId);
}

// ── late editing ────────────────────────────────────────────────────────────────────────────────

/**
 * Edits description / room / wall / infrastructure type / role / task and (optionally) moves the
 * capture to another location. The original photo bytes are never touched; a move relocates the
 * stored files into the new location's folder first, so the photo <-> folder link always holds.
 */
export async function updateCapture(actor: InfraActor, raw: UpdateCaptureInput, deps: InfraDeps): Promise<void> {
  const input = parse(updateCaptureSchema, raw);
  const organizationId = await organizationFor(actor, input.organizationId);
  const db = actorDb(actor);
  const row = await findCaptureRow(db, organizationId, input.captureId);
  if (!row || row.removedAt) throw new NotFoundError('Capture');
  await assertCanEditCapture(actor, row);

  const patch: { -readonly [K in keyof CapturePatch]: CapturePatch[K] } = {};
  const details = input.details;
  if (details.description !== undefined) patch.description = details.description;
  if (details.room !== undefined) patch.room = details.room;
  if (details.wall !== undefined) patch.wall = details.wall;
  if (details.infraType !== undefined) patch.infraType = details.infraType;
  if (details.dimensions !== undefined) patch.dimensions = details.dimensions;
  if (details.note !== undefined) patch.note = details.note;
  if (details.role !== undefined) patch.role = details.role;
  if (input.taskId !== undefined) {
    await assertTaskUsable(actor, { organizationId, projectId: row.projectId, taskId: input.taskId });
    patch.taskId = input.taskId ?? null;
  }

  if (input.locationId && input.locationId !== row.locationId) {
    await authorizeLocation(actor, { organizationId, projectId: row.projectId, locationId: input.locationId, need: 'document' });
    await assertLocationUsable(actor, { organizationId, projectId: row.projectId, locationId: input.locationId });
    const evidenceIds = await captureEvidenceIds(db, organizationId, row.id);
    const briefs = await listEvidenceBriefs(db, organizationId, evidenceIds);
    // Files that already reached the cloud follow the capture; pending ones are written straight into
    // the new folder because the evidence index row is re-pointed below.
    await deps.folders.relocateFiles({
      organizationId,
      projectId: row.projectId,
      locationId: input.locationId,
      documentIds: briefs.filter((brief) => brief.status === 'available').map((brief) => brief.documentId),
    });
    await syncEvidenceLocation(db, organizationId, evidenceIds, input.locationId);
    patch.locationId = input.locationId;
    // A level belongs to the unit it was chosen for: a moved capture starts without one unless a new one is sent.
    if (input.levelId === undefined) patch.levelId = null;
  }
  if (input.levelId !== undefined) {
    await assertLevelUsable(actor, {
      organizationId,
      projectId: row.projectId,
      locationId: input.locationId ?? row.locationId,
      levelId: input.levelId,
    });
    patch.levelId = input.levelId ?? null;
  }

  if (Object.keys(patch).length === 0) return;
  if (!(await updateCaptureRow(db, organizationId, row.id, patch))) throw new NotFoundError('Capture');
}

// ── markings (original stays untouched; each save is a new version + a marked image) ────────────

export interface SaveMarkingsResult {
  readonly versionId: string;
  readonly version: number;
  readonly annotatedEvidenceId: string;
  readonly uploadUrl: string;
}

export async function saveMarkings(actor: InfraActor, raw: SaveMarkingsInput, deps: InfraDeps): Promise<SaveMarkingsResult> {
  const input = parse(saveMarkingsSchema, raw);
  const organizationId = await organizationFor(actor, input.organizationId);
  const db = actorDb(actor);
  const row = await findCaptureRow(db, organizationId, input.captureId);
  if (!row || row.removedAt) throw new NotFoundError('Capture');
  await assertCanEditCapture(actor, row);
  const access = await authorizeLocation(actor, {
    organizationId,
    projectId: row.projectId,
    locationId: row.locationId,
    need: 'document',
  });

  const [original] = await listEvidenceBriefs(db, organizationId, [row.evidenceId]);
  if (!original || original.status !== 'available') {
    throw new DomainRuleError('The photo is not uploaded yet', 'infraMapping.errors.photoNotUploaded');
  }
  if ((original.mimeType ?? '').startsWith('video/')) {
    // Markings are drawn on photos; a video's frame goes through the locate flow instead.
    throw new DomainRuleError('Videos cannot be marked', 'infraMapping.errors.videoNoMarks');
  }

  const version = (await maxVersionNumber(db, organizationId, row.id)) + 1;
  const ticket = await beginEvidence(
    actor,
    access,
    {
      projectId: row.projectId,
      locationId: row.locationId,
      fileName: annotatedFileName(original.fileName, version),
      mimeType: 'image/jpeg',
      sizeBytes: input.annotated.sizeBytes,
      visibility: actor.kind === 'internal' ? undefined : 'contractor',
    },
    deps,
  );

  const versionId = crypto.randomUUID();
  await insertVersion(db, {
    id: versionId,
    organizationId,
    projectId: row.projectId,
    captureId: row.id,
    version,
    annotatedEvidenceId: ticket.evidenceId,
    markingCount: input.markings.length,
    createdByActorType: actor.kind,
    createdByUserId: actorUserId(actor),
    createdByPrincipalId: actorPrincipalId(actor),
  });
  await insertMarkings(
    db,
    input.markings.map((marking, index) => ({
      organizationId,
      projectId: row.projectId,
      captureId: row.id,
      versionId,
      kind: marking.kind,
      geometry: markingGeometry(marking.points as unknown as [number, number][]),
      label: marking.label ?? null,
      infraType: marking.infraType ?? null,
      color: marking.color,
      sortOrder: index,
    })),
  );
  await updateCaptureRow(db, organizationId, row.id, { markingVersion: version });
  return {
    versionId,
    version,
    annotatedEvidenceId: ticket.evidenceId,
    uploadUrl: uploadUrlFor(actor, ticket.evidenceId),
  };
}

// ── removal ─────────────────────────────────────────────────────────────────────────────────────

/** Soft-removes the capture and its files from every listing; the cloud bytes are kept for history. */
export async function removeCapture(
  actor: InfraActor,
  raw: { captureId: string; organizationId?: string | null },
  deps: Pick<InfraDeps, 'files'>,
): Promise<void> {
  const captureId = z.string().uuid().parse(raw.captureId);
  const organizationId = await organizationFor(actor, raw.organizationId);
  const db = actorDb(actor);
  const row = await findCaptureRow(db, organizationId, captureId);
  if (!row || row.removedAt) throw new NotFoundError('Capture');
  await assertCanEditCapture(actor, row);

  const evidenceIds = await captureEvidenceIds(db, organizationId, captureId);
  const briefs = await listEvidenceBriefs(db, organizationId, evidenceIds);
  if (!(await updateCaptureRow(db, organizationId, captureId, { removedAt: new Date() }))) throw new NotFoundError('Capture');
  for (const brief of briefs) {
    if (brief.status === 'removed') continue;
    try {
      if (actor.kind === 'internal') await removeInternalEvidence(actor.context, brief.id);
      else await removeExternalEvidence(actor.context, { organizationId, evidenceId: brief.id }, deps.files);
    } catch (error) {
      // A marked version authored by someone else may not be removable by this actor; the capture row
      // is already hidden, so the leftover file is simply unreachable from the gallery.
      if (!(error instanceof NotFoundError) && !(error instanceof AuthorizationError)) throw error;
    }
  }
}

/** Opens the original in the customer's own cloud (OneDrive / Google Drive / Dropbox / Box). Internal only. */
export async function openCaptureInCloud(
  actor: InfraActor,
  raw: { captureId: string },
  deps: Pick<InfraDeps, 'folders'>,
): Promise<{ url: string | null }> {
  if (actor.kind !== 'internal') throw new AuthorizationError('infra:cloud_link');
  const captureId = z.string().uuid().parse(raw.captureId);
  const db = actorDb(actor);
  const row = await findCaptureJoin(db, actor.context.organizationId, captureId);
  if (!row) throw new NotFoundError('Capture');
  await authorizeLocation(actor, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    locationId: row.locationId,
    need: 'view',
  });
  const [brief] = await listEvidenceBriefs(db, row.organizationId, [row.evidenceId]);
  if (!brief || brief.status !== 'available') return { url: null };
  return { url: await deps.folders.providerWebUrl({ organizationId: row.organizationId, documentId: brief.documentId }) };
}
