import { z } from 'zod';
import { DOCUMENT_OWNER_TYPES } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
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
  includeDeleted: z.boolean().optional(),
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
