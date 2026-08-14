import { z } from 'zod';
import {
  DOCUMENT_NUMBER_KINDS,
  DOCUMENT_NUMBER_PADDING_MAX,
  DOCUMENT_NUMBER_PADDING_MIN,
  DOCUMENT_NUMBER_PREFIX_MAX,
} from '../domain/document-numbers';

export const documentNumberSequenceInputSchema = z.object({
  documentKind: z.enum(DOCUMENT_NUMBER_KINDS),
  prefix: z.string().trim().max(DOCUMENT_NUMBER_PREFIX_MAX),
  padding: z.coerce.number().int().min(DOCUMENT_NUMBER_PADDING_MIN).max(DOCUMENT_NUMBER_PADDING_MAX),
  nextNumber: z.coerce.number().int().min(1),
});

export const saveDocumentNumberSequencesSchema = z.object({
  sequences: z.array(documentNumberSequenceInputSchema).min(1),
});

export type SaveDocumentNumberSequencesInput = z.input<typeof saveDocumentNumberSequencesSchema>;
