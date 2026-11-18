import type { XrefResolveOutcome } from './xref-resolve';

export type XrefResolveApiBody =
  | {
      status: 'found';
      fileId: string;
      name: string;
      parentFolderId: string;
      sizeBytes: number | null;
      resolvedBy: 'saved_path' | 'name_search';
    }
  | { status: 'missing'; reason: string }
  | { status: 'ambiguous'; candidates: Array<{ name: string; relativeFolder: string }> }
  | { status: 'incomplete'; reason: string }
  | { status: 'error'; reason: string };

export function xrefOutcomeToApi(outcome: XrefResolveOutcome, folderId?: string): XrefResolveApiBody {
  switch (outcome.status) {
    case 'found':
      return {
        status: 'found',
        fileId: outcome.file.id,
        name: outcome.file.name,
        parentFolderId: folderId ?? outcome.folderId,
        sizeBytes: outcome.file.sizeBytes ?? null,
        resolvedBy: outcome.resolvedBy,
      };
    case 'missing':
      return { status: 'missing', reason: outcome.reason };
    case 'ambiguous':
      return {
        status: 'ambiguous',
        candidates: outcome.candidates.map((row) => ({
          name: row.name,
          relativeFolder: row.relativeFolder,
        })),
      };
    case 'incomplete':
      return { status: 'incomplete', reason: outcome.reason };
    case 'error':
      return { status: 'error', reason: outcome.reason };
    default:
      return { status: 'error', reason: 'provider_error' };
  }
}

export function xrefApiHttpStatus(body: XrefResolveApiBody): number {
  switch (body.status) {
    case 'found':
      return 200;
    case 'missing':
      return 404;
    case 'ambiguous':
      return 409;
    case 'incomplete':
      return 422;
    case 'error':
      return 502;
    default:
      return 502;
  }
}