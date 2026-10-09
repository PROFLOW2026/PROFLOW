import { headers } from 'next/headers';

/** Set on every matched request by `src/proxy.ts` for server layouts. */
export const REQUEST_PATHNAME_HEADER = 'x-projectflow-pathname';

export async function getRequestPathname(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get(REQUEST_PATHNAME_HEADER) ?? '';
}
