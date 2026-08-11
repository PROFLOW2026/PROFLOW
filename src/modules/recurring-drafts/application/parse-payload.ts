import { ValidationError } from '@/shared/errors';
import { stripFinalizeFlag } from '../domain/payload';
import type { DraftKind, StoredDraftPayload } from '../domain/types';
import { draftPayloadByKindSchema } from '../validation/schemas';

export function parseStoredPayload(kind: DraftKind, raw: unknown): StoredDraftPayload {
  const stripped = stripFinalizeFlag(raw);
  const parsed = draftPayloadByKindSchema.safeParse({ kind, data: stripped });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data as StoredDraftPayload;
}
