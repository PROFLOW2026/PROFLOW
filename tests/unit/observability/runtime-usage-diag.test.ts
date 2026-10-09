import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  classifyUsageRouteArea,
  classifyUsageUaClass,
  detectRscRequest,
  hasSupabaseAuthCookie,
  resolveUsageRouteClass,
} from '@/shared/observability/runtime-usage-diag';

describe('runtime usage diagnostics', () => {
  it('classifies user agents without logging full UA', () => {
    expect(classifyUsageUaClass('Mozilla/5.0 Chrome/120')).toBe('browser');
    expect(classifyUsageUaClass('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe('googlebot');
    expect(classifyUsageUaClass('UptimeRobot/2.0')).toBe('uptime_monitor');
    expect(classifyUsageUaClass('curl/8.0')).toBe('cli');
  });

  it('classifies route areas', () => {
    expect(classifyUsageRouteArea('/he-IL')).toBe('document');
    expect(classifyUsageRouteArea('/he-IL/legal/privacy')).toBe('legal');
    expect(classifyUsageRouteArea('/he-IL/sign-in')).toBe('auth');
    expect(classifyUsageRouteArea('/he-IL/today')).toBe('app');
    expect(classifyUsageRouteArea('/he-IL/contractor/sign-in')).toBe('contractor');
  });

  it('detects RSC and auth cookie flags', () => {
    const rsc = new NextRequest('https://app.example/he-IL/today', {
      headers: { RSC: '1' },
    });
    expect(detectRscRequest(rsc)).toBe(true);
    expect(resolveUsageRouteClass('/he-IL/today', rsc)).toBe('rsc');

    const authed = new NextRequest('https://app.example/he-IL/today', {
      headers: { cookie: 'sb-test-auth-token=1' },
    });
    expect(hasSupabaseAuthCookie(authed)).toBe(true);
  });
});
