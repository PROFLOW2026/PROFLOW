/**
 * Safe, support-friendly description of why a cloud folder could not be created (pure).
 *
 * Only a stage and a short code are produced: HTTP status of the provider, Postgres error code and
 * constraint, or the application message key. Never a token, URL, header or provider response body.
 */

export type FolderStage = 'connection' | 'token' | 'project_folder' | 'locations' | 'folder';

export interface FolderFailureInfo {
  readonly stage: FolderStage;
  readonly code: string;
}

const PG_CODE = /^[0-9A-Z]{5}$/;

function chain(error: unknown): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  let cursor: unknown = error;
  for (let depth = 0; depth < 6 && cursor && typeof cursor === 'object' && !seen.has(cursor); depth += 1) {
    seen.add(cursor);
    items.push(cursor as Record<string, unknown>);
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return items;
}

function safeToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60);
}

export function describeFolderFailure(stage: FolderStage, error: unknown): FolderFailureInfo {
  const items = chain(error);
  for (const item of items) {
    if (item.name === 'ProviderHttpError' && typeof item.status === 'number') {
      return { stage, code: `provider_${item.status}` };
    }
  }
  for (const item of items) {
    if (typeof item.code === 'string' && PG_CODE.test(item.code)) {
      const constraint = typeof item.constraint_name === 'string' ? item.constraint_name : typeof item.constraint === 'string' ? item.constraint : '';
      return { stage, code: constraint ? `pg_${item.code}_${safeToken(constraint)}` : `pg_${item.code}` };
    }
  }
  const first = items[0];
  if (first && typeof first.messageKey === 'string') return { stage, code: safeToken(first.messageKey) || 'app_error' };
  if (first && typeof first.name === 'string') return { stage, code: safeToken(first.name) || 'error' };
  return { stage, code: 'unknown' };
}
