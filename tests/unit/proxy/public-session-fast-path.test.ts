import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  isPublicSessionFastPathCandidate,
  requestHasSupabaseAuthCookies,
  shouldSkipProxySessionRefresh,
} from '@/shared/proxy/public-session-fast-path';

function req(path: string, cookies: Record<string, string> = {}): NextRequest {
  const url = `https://app.example.com${path}`;
  return new NextRequest(url, {
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    },
  });
}

describe('proxy public session fast path', () => {
  it('recognizes org auth and legal candidates', () => {
    expect(isPublicSessionFastPathCandidate('/he-IL/sign-in')).toBe(true);
    expect(isPublicSessionFastPathCandidate('/en/sign-up')).toBe(true);
    expect(isPublicSessionFastPathCandidate('/he-IL/forgot-password')).toBe(true);
    expect(isPublicSessionFastPathCandidate('/he-IL/portal-access')).toBe(true);
    expect(isPublicSessionFastPathCandidate('/he-IL/legal/terms')).toBe(true);
    expect(isPublicSessionFastPathCandidate('/he-IL/legal/privacy')).toBe(true);
    expect(isPublicSessionFastPathCandidate('/he-IL/today')).toBe(false);
    expect(isPublicSessionFastPathCandidate('/he-IL/projects/abc')).toBe(false);
    expect(isPublicSessionFastPathCandidate('/he-IL/contractor/sign-in')).toBe(false);
  });

  it('skips session refresh on legal paths even with auth cookies', () => {
    const request = req('/he-IL/legal/privacy', { 'sb-test-auth-token': 'x' });
    expect(requestHasSupabaseAuthCookies(request)).toBe(true);
    expect(shouldSkipProxySessionRefresh(request, '/he-IL/legal/privacy')).toBe(true);
  });

  it('skips org auth pages only for anonymous visitors', () => {
    expect(shouldSkipProxySessionRefresh(req('/he-IL/sign-in'), '/he-IL/sign-in')).toBe(true);
    expect(
      shouldSkipProxySessionRefresh(
        req('/he-IL/sign-in', { 'sb-test-auth-token': '1' }),
        '/he-IL/sign-in',
      ),
    ).toBe(false);
  });

  it('never skips protected app routes', () => {
    expect(shouldSkipProxySessionRefresh(req('/he-IL'), '/he-IL')).toBe(false);
    expect(
      shouldSkipProxySessionRefresh(req('/he-IL/projects/p1'), '/he-IL/projects/p1'),
    ).toBe(false);
  });
});
