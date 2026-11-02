import { z } from 'zod';
import { alignmentRecordSchema } from './alignment-record';
import { MAX_MARKINGS_PER_VERSION, markingInputSchema } from './markings';
import {
  INFRA_CAPTURE_ROLES,
  INFRA_CAPTURE_SOURCES,
  INFRA_COMPARISON_MODES,
  INFRA_TYPES,
} from './types';

const uuid = z.string().uuid();

/** Empty / blank text becomes null so optional columns stay NULL, never ''. */
function normalizeText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Empty strings from forms become null so optional columns stay NULL, never ''. */
const optionalText = (max: number) => z.string().max(max).nullish().transform(normalizeText);

export const captureDetailsSchema = z.object({
  description: optionalText(1000),
  room: optionalText(120),
  wall: optionalText(120),
  infraType: z.enum(INFRA_TYPES).nullish().transform((value) => value ?? null),
  dimensions: optionalText(120),
  note: optionalText(1000),
  role: z.enum(INFRA_CAPTURE_ROLES).default('documentation'),
});
export type CaptureDetailsInput = z.input<typeof captureDetailsSchema>;
export type CaptureDetails = z.output<typeof captureDetailsSchema>;

const fileMetaSchema = z.object({
  fileName: z.string().min(1).max(180),
  mimeType: z.string().max(200).nullish(),
  sizeBytes: z.number().int().positive(),
});
export type FileMetaInput = z.input<typeof fileMetaSchema>;

/** Only the location is mandatory; everything else is optional and may be edited later. */
export const beginCaptureSchema = z.object({
  projectId: uuid,
  locationId: uuid,
  /** Optional level of a multi-level unit this photo / video belongs to (0196). */
  levelId: uuid.nullish(),
  organizationId: uuid.nullish(),
  clientCaptureId: uuid,
  taskId: uuid.nullish(),
  source: z.enum(INFRA_CAPTURE_SOURCES).default('camera'),
  capturedAt: z.string().datetime().nullish(),
  visibility: z.enum(['internal', 'contractor']).nullish(),
  file: fileMetaSchema,
  // prefault parses the empty object through the schema so omitted fields become NULL (not undefined).
  details: captureDetailsSchema.prefault({}),
});
export type BeginCaptureInput = z.input<typeof beginCaptureSchema>;

/** Same capture, but the file is a short video; the duration is checked here and again on the file name. */
export const beginVideoCaptureSchema = beginCaptureSchema.extend({
  durationMs: z.number().int().min(1).max(60_000),
});
export type BeginVideoCaptureInput = z.input<typeof beginVideoCaptureSchema>;

/**
 * A PATCH: only the keys the caller sent are present in the output. (Reusing `captureDetailsSchema`
 * with `.partial()` would turn every omitted field into NULL and silently wipe it.)
 */
const updateDetailsSchema = z
  .object({
    description: z.string().max(1000).nullable().optional(),
    room: z.string().max(120).nullable().optional(),
    wall: z.string().max(120).nullable().optional(),
    infraType: z.enum(INFRA_TYPES).nullable().optional(),
    dimensions: z.string().max(120).nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
    role: z.enum(INFRA_CAPTURE_ROLES).optional(),
  })
  .transform((raw) => ({
    ...(raw.description !== undefined ? { description: normalizeText(raw.description) } : {}),
    ...(raw.room !== undefined ? { room: normalizeText(raw.room) } : {}),
    ...(raw.wall !== undefined ? { wall: normalizeText(raw.wall) } : {}),
    ...(raw.infraType !== undefined ? { infraType: raw.infraType } : {}),
    ...(raw.dimensions !== undefined ? { dimensions: normalizeText(raw.dimensions) } : {}),
    ...(raw.note !== undefined ? { note: normalizeText(raw.note) } : {}),
    ...(raw.role !== undefined ? { role: raw.role } : {}),
  }));

export const updateCaptureSchema = z.object({
  captureId: uuid,
  organizationId: uuid.nullish(),
  /** Moves the capture to another location of the same project (cloud file follows). */
  locationId: uuid.nullish(),
  /** Level of a multi-level unit; null clears it (the location tree is used again). */
  levelId: uuid.nullish(),
  taskId: uuid.nullish(),
  details: updateDetailsSchema,
});
export type UpdateCaptureInput = z.input<typeof updateCaptureSchema>;

export const saveMarkingsSchema = z.object({
  captureId: uuid,
  organizationId: uuid.nullish(),
  /** Marking set (replaces nothing: it becomes the next version). */
  markings: z.array(markingInputSchema).max(MAX_MARKINGS_PER_VERSION),
  /** The rendered annotated image (a separate file next to the untouched original). */
  annotated: fileMetaSchema,
});
export type SaveMarkingsInput = z.input<typeof saveMarkingsSchema>;

export const listCapturesSchema = z.object({
  projectId: uuid,
  organizationId: uuid.nullish(),
  locationId: uuid.nullish(),
  includeSubLocations: z.boolean().default(true),
  /** Level filter (floor / basement / roof): units on it, multi-level units that reach it, and their spaces. */
  levelId: uuid.nullish(),
  text: z.string().trim().max(120).nullish(),
  room: z.string().trim().max(120).nullish(),
  wall: z.string().trim().max(120).nullish(),
  infraType: z.enum(INFRA_TYPES).nullish(),
  role: z.enum(INFRA_CAPTURE_ROLES).nullish(),
  taskId: uuid.nullish(),
  from: z.string().date().nullish(),
  to: z.string().date().nullish(),
  mineOnly: z.boolean().default(false),
  /** Only photos or only videos; omitted = both (the gallery shows them together). */
  media: z.enum(['photo', 'video']).nullish(),
  cursor: z.string().max(200).nullish(),
  limit: z.number().int().min(1).max(60).default(30),
});
export type ListCapturesInput = z.input<typeof listCapturesSchema>;

export const beginComparisonSchema = z
  .object({
    projectId: uuid,
    organizationId: uuid.nullish(),
    locationId: uuid,
    taskId: uuid.nullish(),
    clientComparisonId: uuid,
    mode: z.enum(INFRA_COMPARISON_MODES),
    /** A catalogued photo already in the gallery (preferred "before"). */
    beforeCaptureId: uuid.nullish(),
    alignment: alignmentRecordSchema,
    reliable: z.boolean().default(true),
    note: optionalText(1000),
    /** Files the user explicitly chose to keep. Nothing is saved implicitly. */
    files: z
      .object({
        before: fileMetaSchema.nullish(),
        after: fileMetaSchema.nullish(),
        result: fileMetaSchema.nullish(),
      })
      .default({}),
    afterDetails: captureDetailsSchema.partial().nullish(),
  })
  .superRefine((value, ctx) => {
    const subject = value.beforeCaptureId || value.files.before || value.files.after || value.files.result;
    if (!subject) ctx.addIssue({ code: 'custom', path: ['files'], message: 'nothing_to_save' });
  });
export type BeginComparisonInput = z.input<typeof beginComparisonSchema>;

export const folderLinkSchema = z.object({
  projectId: uuid,
  /** NULL links the project's infrastructure root. */
  locationId: uuid.nullish(),
  externalFolderId: z.string().min(1).max(500),
});
export type FolderLinkInput = z.input<typeof folderLinkSchema>;

export const folderSyncSchema = z.object({
  projectId: uuid,
  /** Sync these locations (and their ancestors); omit for the whole project tree. */
  locationIds: z.array(uuid).max(500).nullish(),
  /** Locations handled per call (provider API pacing). */
  batchSize: z.number().int().min(1).max(40).default(20),
});
export type FolderSyncInput = z.input<typeof folderSyncSchema>;
