import { headers } from 'next/headers';
import type { NextResponse } from 'next/server';

/**
 * Incoming request header read by server layouts via `headers()`.
 * `src/proxy.ts` forwards it on the middleware request override.
 * It must not be copied onto the client-visible response.
 */
export const REQUEST_PATHNAME_HEADER = 'x-projectflow-pathname';

export async function getRequestPathname(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get(REQUEST_PATHNAME_HEADER) ?? '';
}

/**
 * Attach the pathname to a middleware continuation (`next` / `rewrite`) so
 * `headers()` can see it. Redirects are left unchanged. A partial override
 * list is never created: Next drops every request header missing from
 * `x-middleware-override-headers`.
 */
export function forwardRequestPathname(response: NextResponse, pathname: string): NextResponse {
  response.headers.delete(REQUEST_PATHNAME_HEADER);
  const continues =
    response.headers.has('x-middleware-next') || response.headers.has('x-middleware-rewrite');
  if (!continues) return response;

  const existing = response.headers.get('x-middleware-override-headers');
  if (existing == null) return response;

  const names = existing
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (!names.includes(REQUEST_PATHNAME_HEADER)) {
    names.push(REQUEST_PATHNAME_HEADER);
    response.headers.set('x-middleware-override-headers', names.join(','));
  }
  response.headers.set(`x-middleware-request-${REQUEST_PATHNAME_HEADER}`, pathname);
  return response;
}
