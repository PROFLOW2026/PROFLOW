/**
 * Page-render marker for a known authorization failure.
 *
 * Next.js forwards `digest` to the nearest error boundary and strips the
 * server message. This digest is intentionally not a Next.js router interrupt
 * (`NEXT_HTTP_ERROR_FALLBACK` / `NEXT_NOT_FOUND`), so:
 * - caught denials still see `AuthorizationError` (project screens keep `notFound()`)
 * - `unstable_rethrow` does not turn a denial into a navigation
 * - server actions and file routes keep mapping this error themselves
 *
 * `requireProjectCapabilityPage` does not throw this error. A missing project,
 * a bad id, and a missing capability stay `notFound()`.
 */
export const PAGE_AUTHORIZATION_DIGEST = 'pf:authorization_denied';

export function isPageAuthorizationFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false;
  return (error as { digest?: unknown }).digest === PAGE_AUTHORIZATION_DIGEST;
}

/** Nested error boundaries rethrow so the locale boundary can show errors.notAllowed. */
export function rethrowIfPageAuthorization(error: unknown): void {
  if (isPageAuthorizationFailure(error)) {
    throw error;
  }
}