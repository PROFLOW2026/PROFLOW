import {
  AppError,
  AuthenticationRequiredError,
  AuthorizationError,
  NotFoundError,
} from './app-error';

/** JSON body for browser-facing API routes — messageKey only, never English Exception text. */
export function apiRouteErrorBody(messageKey: string): { readonly error: string } {
  return { error: messageKey };
}

export function apiRouteErrorResponse(messageKey: string, status: number): Response {
  return Response.json(apiRouteErrorBody(messageKey), { status });
}

export function apiRouteErrorFromUnknown(error: unknown, fallbackMessageKey: string): Response {
  if (error instanceof AppError) {
    return apiRouteErrorResponse(error.messageKey, error.status);
  }
  return apiRouteErrorResponse(fallbackMessageKey, 500);
}

const REDIRECT_FALLBACK_MESSAGE = 'redirect() was expected to interrupt rendering';

/** Postgres codes that mean "no such row" or "no access", never a storage outage. */
const MISSING_OR_DENIED_DB_CODES = new Set(['22P02', '02000', 'P0002', '42501']);

type ProviderHttpLike = {
  readonly name?: string;
  readonly status?: number;
  readonly isThrottleLike?: () => boolean;
};

function frameworkDigest(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return null;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' ? digest : null;
}

function readDatabaseCode(error: unknown, depth = 0): string | null {
  if (depth > 5 || typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  return readDatabaseCode((error as { cause?: unknown }).cause, depth + 1);
}

function asProviderHttp(error: unknown): ProviderHttpLike | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as ProviderHttpLike;
  if (candidate.name !== 'ProviderHttpError' || typeof candidate.status !== 'number') return null;
  return candidate;
}

function emptyStatus(status: number): Response {
  return new Response(null, { status });
}

/**
 * File-byte routes.
 *
 * No session → 401 with an empty body. A missing record or no access → 404 with
 * an empty body (no ids, resource names, or provider payloads). 500 is reserved
 * for a real storage failure and carries only a messageKey.
 * `requireSession` / `requireExternalContext` redirects are rethrown, except a
 * sign-in redirect, which is the unauthenticated case and must not become 500.
 */
export function fileRouteErrorResponse(error: unknown): Response {
  const digest = frameworkDigest(error);
  if (digest?.startsWith('NEXT_REDIRECT')) {
    if (digest.includes('sign-in')) return emptyStatus(401);
    throw error;
  }
  if (digest?.startsWith('NEXT_NOT_FOUND') || digest?.startsWith('NEXT_HTTP_ERROR_FALLBACK')) {
    throw error;
  }
  if (error instanceof Error && error.message === REDIRECT_FALLBACK_MESSAGE) {
    throw error;
  }

  if (error instanceof AuthenticationRequiredError) return emptyStatus(401);
  if (error instanceof NotFoundError || error instanceof AuthorizationError) return emptyStatus(404);

  const dbCode = readDatabaseCode(error);
  if (dbCode && MISSING_OR_DENIED_DB_CODES.has(dbCode)) return emptyStatus(404);

  const provider = asProviderHttp(error);
  if (provider) {
    const missing =
      provider.status === 404 ||
      provider.status === 410 ||
      (provider.status === 403 && provider.isThrottleLike?.() !== true);
    if (missing) return emptyStatus(404);
    return apiRouteErrorResponse('externalStorage.errors.operationFailed', 500);
  }

  if (error instanceof Error && error.name === 'StorageNotConfiguredError') {
    return apiRouteErrorResponse('externalStorage.errors.operationFailed', 500);
  }

  if (error instanceof AppError) {
    return apiRouteErrorResponse(error.messageKey, error.status);
  }

  return apiRouteErrorResponse('errors.unexpected', 500);
}
