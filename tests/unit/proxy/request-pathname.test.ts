import { describe, expect, it } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  forwardRequestPathname,
  REQUEST_PATHNAME_HEADER,
} from '@/shared/http/request-pathname';

describe('forwardRequestPathname', () => {
  it('forwards the pathname on the request override and not the response', () => {
    const request = new NextRequest('https://app.example.com/en/dashboard');
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-test-keep', '1');
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    forwardRequestPathname(response, '/en/dashboard');

    expect(response.headers.get(REQUEST_PATHNAME_HEADER)).toBeNull();
    expect(response.headers.get(`x-middleware-request-${REQUEST_PATHNAME_HEADER}`)).toBe(
      '/en/dashboard',
    );
    expect(response.headers.get('x-middleware-override-headers')).toContain('x-test-keep');
    expect(response.headers.get('x-middleware-override-headers')).toContain(REQUEST_PATHNAME_HEADER);
  });

  it('does not attach the pathname to a redirect response', () => {
    const response = NextResponse.redirect('https://app.example.com/he-IL/sign-in');
    forwardRequestPathname(response, '/sign-in');
    expect(response.headers.get(REQUEST_PATHNAME_HEADER)).toBeNull();
    expect(response.headers.get(`x-middleware-request-${REQUEST_PATHNAME_HEADER}`)).toBeNull();
  });
});
