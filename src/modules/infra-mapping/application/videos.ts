import { z } from 'zod';
import { finalizeInternalEvidenceUpload, type StoredFile } from '@/modules/evidence';
import { contentMatchesMime } from '@/modules/evidence/domain/file-policy';
import { AuthorizationError, ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  findCaptureByClientId,
  insertCapture,
  listEvidenceBriefs,
} from '../data/infra.repository';
import {
  INFRA_VIDEO_MAX_MS,
  checkInfraVideo,
  infraVideoFileName,
  isValidChunkRequest,
  needsChunking,
  INFRA_VIDEO_CHUNK_BYTES,
  INFRA_VIDEO_SINGLE_MAX_BYTES,
  type VideoChunkResponse,
} from '../domain/video';
import { beginVideoCaptureSchema, type BeginVideoCaptureInput } from '../domain/validation';
import {
  actorDb,
  actorPrincipalId,
  actorUserId,
  authorizeLocation,
  isAuthor,
  organizationFor,
} from './access';
import { assertLevelUsable, assertLocationUsable, assertTaskUsable, beginEvidence, type BeginCaptureResult } from './captures';
import type { InfraActor, InfraDeps } from './ports';

/**
 * Short infrastructure videos. A video is an ordinary capture (same locations, folder, permissions,
 * gallery) whose evidence file is a `video`. The bytes never travel in one request: the browser
 * sends them in chunks to `/api/infra/video-upload/:evidenceId`, which relays each chunk to the
 * organization's own cloud storage. Vercel only orchestrates - nothing is kept on our side.
 */

export const INFRA_VIDEO_UPLOAD_PATH = '/api/infra/video-upload';

export interface VideoChunkIn {
  readonly organizationId: string;
  readonly projectId: string;
  readonly locationId: string;
  readonly documentId: string;
  readonly evidenceId: string;
  readonly userId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly totalBytes: number;
  readonly offset: number;
  readonly bytes: Uint8Array;
  /** Opaque sealed token returned by the previous chunk (null for the first one). */
  readonly session: string | null;
}

export type VideoChunkOut =
  | { readonly kind: 'continue'; readonly session: string; readonly nextOffset: number }
  | { readonly kind: 'complete'; readonly stored: StoredFile };

/** Trusted (service-role) provider operations; production wiring lives in `video-server.ts`. */
export interface InfraVideoPort {
  /** Throws a DomainRuleError when the connected provider cannot take a video of this size. */
  assertCanStore(input: { organizationId: string; sizeBytes: number }): Promise<void>;
  uploadChunk(input: VideoChunkIn): Promise<VideoChunkOut>;
}

export interface BeginVideoCaptureResult extends BeginCaptureResult {
  readonly chunkBytes: number;
  readonly singleMaxBytes: number;
}

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  }
  return result.data;
}

function assertInternal(actor: InfraActor): asserts actor is Extract<InfraActor, { kind: 'internal' }> {
  // Trial scope: videos are an owner/office capability. Contractors never reach this code.
  if (actor.kind !== 'internal') throw new AuthorizationError('infra:video');
}

const VIDEO_REJECTION_KEYS = {
  type: 'infraMapping.errors.videoType',
  empty: 'infraMapping.errors.videoEmpty',
  too_large: 'infraMapping.errors.videoTooLarge',
  too_long: 'infraMapping.errors.videoTooLong',
  unknown_duration: 'infraMapping.errors.videoDuration',
} as const;

/**
 * Registers a video capture and returns the upload ticket. Called ONLY after the user approved the
 * recording. Idempotent on `clientCaptureId` (a retry never creates a second capture).
 */
export async function beginVideoCapture(
  actor: InfraActor,
  raw: BeginVideoCaptureInput,
  deps: InfraDeps,
  port: Pick<InfraVideoPort, 'assertCanStore'>,
): Promise<BeginVideoCaptureResult> {
  assertInternal(actor);
  const input = parse(beginVideoCaptureSchema, raw);
  const organizationId = await organizationFor(actor, input.organizationId);
  const access = await authorizeLocation(actor, {
    organizationId,
    projectId: input.projectId,
    locationId: input.locationId,
    need: 'document',
  });
  const db = actorDb(actor);
  const tuning = { chunkBytes: INFRA_VIDEO_CHUNK_BYTES, singleMaxBytes: INFRA_VIDEO_SINGLE_MAX_BYTES };

  const existing = await findCaptureByClientId(db, organizationId, input.clientCaptureId);
  if (existing) {
    if (!isAuthor(actor, existing) || existing.projectId !== access.projectId) throw new NotFoundError('Capture');
    const [brief] = await listEvidenceBriefs(db, organizationId, [existing.evidenceId]);
    if (!brief || brief.status === 'removed') throw new ConflictError('Capture was removed', 'infraMapping.errors.captureRemoved');
    return {
      captureId: existing.id,
      evidenceId: existing.evidenceId,
      uploadUrl: `${INFRA_VIDEO_UPLOAD_PATH}/${existing.evidenceId}`,
      alreadyUploaded: brief.status === 'available',
      ...tuning,
    };
  }

  const check = checkInfraVideo({
    mimeType: input.file.mimeType,
    fileName: input.file.fileName,
    sizeBytes: input.file.sizeBytes,
    durationMs: input.durationMs,
  });
  if (!check.ok) throw new DomainRuleError(`Video rejected: ${check.reason}`, VIDEO_REJECTION_KEYS[check.reason]);

  await assertLocationUsable(actor, { organizationId, projectId: access.projectId, locationId: input.locationId });
  await assertTaskUsable(actor, { organizationId, projectId: access.projectId, taskId: input.taskId });
  await assertLevelUsable(actor, { organizationId, projectId: access.projectId, locationId: input.locationId, levelId: input.levelId });
  await port.assertCanStore({ organizationId, sizeBytes: input.file.sizeBytes });

  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
  const safeCapturedAt = Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 5 * 60_000 ? new Date() : capturedAt;
  const ticket = await beginEvidence(
    actor,
    access,
    {
      projectId: access.projectId,
      locationId: input.locationId,
      fileName: infraVideoFileName({
        capturedAt: safeCapturedAt,
        clientCaptureId: input.clientCaptureId,
        durationMs: Math.min(input.durationMs, INFRA_VIDEO_MAX_MS),
        mimeType: check.mimeType,
      }),
      mimeType: check.mimeType,
      sizeBytes: input.file.sizeBytes,
      visibility: input.visibility ?? null,
      accept: ['video'],
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
    uploadUrl: `${INFRA_VIDEO_UPLOAD_PATH}/${ticket.evidenceId}`,
    alreadyUploaded: false,
    ...tuning,
  };
}

const chunkSchema = z.object({
  evidenceId: z.string().uuid(),
  offset: z.number().int().min(0),
  totalBytes: z.number().int().positive(),
  session: z.string().max(8000).nullish(),
});

export interface VideoChunkRequest {
  readonly evidenceId: string;
  readonly offset: number;
  readonly totalBytes: number;
  readonly session?: string | null;
  readonly bytes: Uint8Array;
}

/**
 * Relays one chunk to the cloud and answers where the transfer stands. The client keeps sending
 * from `nextOffset` until `done`; a repeated or lost request is therefore harmless.
 */
export async function uploadVideoChunk(
  actor: InfraActor,
  raw: VideoChunkRequest,
  port: Pick<InfraVideoPort, 'uploadChunk'>,
  deps: Pick<InfraDeps, 'files'>,
): Promise<VideoChunkResponse> {
  assertInternal(actor);
  const input = parse(chunkSchema, raw);
  const bytes = raw.bytes;
  if (!isValidChunkRequest({ totalBytes: input.totalBytes, offset: input.offset, length: bytes.length })) {
    throw new DomainRuleError('Invalid video chunk', 'infraMapping.errors.videoChunk');
  }
  const { organizationId, userId } = actor.context;
  const [brief] = await listEvidenceBriefs(actorDb(actor), organizationId, [input.evidenceId]);
  if (!brief || brief.kind !== 'video' || brief.uploadedByActorType !== 'internal' || brief.uploadedByUserId !== userId) {
    throw new NotFoundError('Evidence');
  }
  if (brief.status === 'available') return { done: true, nextOffset: input.totalBytes, session: null };
  if (brief.status !== 'pending') throw new ConflictError('Evidence is not awaiting upload', 'infraMapping.errors.captureRemoved');
  if (brief.sizeBytes !== undefined && brief.sizeBytes !== input.totalBytes) {
    throw new DomainRuleError('Video size changed', 'infraMapping.errors.videoChunk');
  }
  if (!brief.locationId) throw new NotFoundError('Location');
  if (input.offset === 0 && !contentMatchesMime(bytes.subarray(0, 32), brief.mimeType)) {
    throw new DomainRuleError('Content does not match type', 'projectPlans.evidence.errors.contentMismatch');
  }
  if (!needsChunking(input.totalBytes) && input.session) {
    throw new DomainRuleError('Unexpected session', 'infraMapping.errors.videoChunk');
  }

  const result = await port.uploadChunk({
    organizationId,
    projectId: brief.projectId,
    locationId: brief.locationId,
    documentId: brief.documentId,
    evidenceId: brief.id,
    userId,
    fileName: brief.fileName,
    mimeType: brief.mimeType,
    totalBytes: input.totalBytes,
    offset: input.offset,
    bytes,
    session: input.session ?? null,
  });

  if (result.kind === 'complete') {
    await finalizeInternalEvidenceUpload(actor.context, { evidenceId: brief.id, stored: result.stored }, deps.files);
    return { done: true, nextOffset: input.totalBytes, session: null };
  }
  return { done: false, nextOffset: Math.min(result.nextOffset, input.totalBytes), session: result.session };
}