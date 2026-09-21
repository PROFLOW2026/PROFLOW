import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { runCommittedStorageWrite } from '@/modules/external-storage/server';
import type { DbExecutor } from '@/shared/db/types';
import {
  isDocumentNumberKind,
  suppliedDocumentReference,
  type AllocatedDocumentNumberKind,
  type DocumentNumberKind,
  type DocumentNumberSequenceRecord,
} from '../domain/document-numbers';
import {
  listDocumentNumberSequences as listSequenceRows,
  upsertDocumentNumberSequence,
} from '../data/document-numbers.repository';
import {
  saveDocumentNumberSequencesSchema,
  type SaveDocumentNumberSequencesInput,
} from '../validation/document-numbers';

function scalarText(result: unknown, column: string): string | null {
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const value = rows[0]?.[column];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export async function listDocumentNumberSettings(
  context: OrgContext,
): Promise<DocumentNumberSequenceRecord[]> {
  assertPermission(context, PERMISSIONS.ORG_READ);
  return listSequenceRows(context.db, context.organizationId);
}

export async function saveDocumentNumberSettings(
  context: OrgContext,
  rawInput: SaveDocumentNumberSequencesInput,
): Promise<DocumentNumberSequenceRecord[]> {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);

  const parsed = saveDocumentNumberSequencesSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  for (const sequence of parsed.data.sequences) {
    await upsertDocumentNumberSequence(context.db, {
      organizationId: context.organizationId,
      documentKind: sequence.documentKind,
      prefix: sequence.prefix,
      padding: sequence.padding,
      nextNumber: sequence.nextNumber,
    });
  }

  return listSequenceRows(context.db, context.organizationId);
}

function isDbPermissionDenied(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current != null; depth += 1) {
    if (typeof current !== 'object') break;
    const code = (current as { code?: string }).code;
    if (code === '42501') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function executeAllocateDocumentNumber(
  db: DbExecutor,
  organizationId: string,
  kind: DocumentNumberKind,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT app.next_document_number(${organizationId}::uuid, ${kind}) AS document_number
  `);
  const allocated = scalarText(result, 'document_number');
  if (!allocated) {
    throw new DomainRuleError(
      'Could not allocate an internal document number',
      'organization.errors.documentNumberFailed',
    );
  }
  return allocated;
}

/**
 * Allocates the next internal tracking number for `kind`.
 * Not statutory Israeli invoice numbering.
 *
 * Call only after application-level authorization (e.g. projects.create).
 * Employee App grants are not visible to the DB function; elevate on 42501 only.
 */
export async function allocateDocumentNumber(
  context: OrgContext,
  kind: DocumentNumberKind | AllocatedDocumentNumberKind,
): Promise<string> {
  if (!isDocumentNumberKind(kind)) {
    throw new DomainRuleError('Unknown document number kind', 'organization.errors.unknownDocumentKind');
  }

  try {
    return await executeAllocateDocumentNumber(context.db, context.organizationId, kind);
  } catch (error) {
    if (!isDbPermissionDenied(error)) throw error;
    return runCommittedStorageWrite((adminDb) =>
      executeAllocateDocumentNumber(adminDb, context.organizationId, kind),
    );
  }
}

export async function resolveAllocatedReference(
  context: OrgContext,
  kind: AllocatedDocumentNumberKind,
  userReference: string | null | undefined,
): Promise<string> {
  const supplied = suppliedDocumentReference(userReference);
  if (supplied) return supplied;
  return allocateDocumentNumber(context, kind);
}
