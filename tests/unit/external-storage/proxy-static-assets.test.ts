import { describe, expect, it } from 'vitest';

/** Mirrors src/proxy.ts matcher — static assets must bypass locale redirect. */
const PROXY_MATCHER =
  '/((?!api|auth|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|pdf\\.worker\\.min\\.mjs|pdf\\.worker\\.version\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|mjs)$).*)';

function proxyMatches(pathname: string): boolean {
  return new RegExp(PROXY_MATCHER).test(pathname);
}

describe('proxy static asset exclusions', () => {
  it('does not locale-redirect the PDF.js worker', () => {
    expect(proxyMatches('/pdf.worker.min.mjs')).toBe(false);
  });

  it('does not locale-redirect the service worker', () => {
    expect(proxyMatches('/sw.js')).toBe(false);
  });

  it('still locale-handles app routes', () => {
    expect(proxyMatches('/projects')).toBe(true);
    expect(proxyMatches('/he-IL/projects')).toBe(true);
  });
});
