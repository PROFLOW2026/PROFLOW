import { z } from 'zod';
import { DOCUMENT_OWNER_TYPES } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

/** Keep missing keys undefined so a patch does not wipe unspecified columns. */
const blankToNull = (value: unknown) => {
  if (value === '') return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional());

export const prepareUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.coerce.number().int().positive(),
  ownerType: z.enum(DOCUMENT_OWNER_TYPES),
  ownerId: z.string().uuid(),
  label: optionalText,
});

export type PrepareUploadInput = z.input<typeof prepareUploadSchema>;

export const finalizeUploadSchema = z.object({
  documentId: z.string().uuid(),
  sizeBytes: z.coerce.number().int().positive(),
  checksum: z.string().trim().min(1).max(128).optional(),
});

export type FinalizeUploadInput = z.input<typeof finalizeUploadSchema>;

export const documentIdSchema = z.object({
  documentId: z.string().uuid(),
});

export const listEntityDocumentsSchema = z.object({
  ownerType: z.enum(DOCUMENT_OWNER_TYPES),
  ownerId: z.string().uuid(),
});

export const listDocumentsSchema = z.object({
  search: z.string().trim().optional(),
  ownerType: z.enum([...DOCUMENT_OWNER_TYPES, 'all'] as const).optional(),
  folderId: z.union([z.literal('all'), z.literal('none'), z.string().uuid()]).optional(),
  includeDeleted: z.boolean().optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const linkDocumentSchema = z.object({
  documentId: z.string().uuid(),
  ownerType: z.enum(DOCUMENT_OWNER_TYPES),
  ownerId: z.string().uuid(),
  label: optionalText,
});

export const unlinkDocumentSchema = z.object({
  linkId: z.string().uuid(),
});

export const deleteDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
  ownerType: z.preprocess(
    blankToNull,
    z.enum(DOCUMENT_OWNER_TYPES).nullable().optional(),
  ),
  ownerId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
}).refine(
  (value) => (value.ownerType && value.ownerId) || (!value.ownerType && !value.ownerId),
  { message: 'ownerType and ownerId must be set together', path: ['ownerId'] },
);

export const listFoldersSchema = z.object({
  ownerType: z.enum(DOCUMENT_OWNER_TYPES).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
});

export const prepareNewVersionSchema = z.object({
  documentId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.coerce.number().int().positive(),
});

export const finalizeNewVersionSchema = z.object({
  documentId: z.string().uuid(),
  storagePath: z.string().trim().min(1).max(500),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.coerce.number().int().positive(),
  notes: optionalText,
});

export const versionIdSchema = z.object({
  versionId: z.string().uuid(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const setDocumentMetadataSchema = z
  .object({
    documentId: z.string().uuid(),
    category: z.preprocess(blankToNull, z.string().trim().max(40).nullable().optional()),
    tags: z.preprocess(blankToNull, z.string().trim().max(500).nullable().optional()),
    expiresAt: z.preprocess(blankToNull, isoDate.nullable().optional()),
    isRequired: z.boolean().optional(),
    requiredType: z.preprocess(blankToNull, z.string().trim().max(80).nullable().optional()),
    folderId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
  })
  .refine(
    (value) =>
      value.category !== undefined ||
      value.tags !== undefined ||
      value.expiresAt !== undefined ||
      value.isRequired !== undefined ||
      value.requiredType !== undefined ||
      value.folderId !== undefined,
    { message: 'At least one field is required' },
  );
