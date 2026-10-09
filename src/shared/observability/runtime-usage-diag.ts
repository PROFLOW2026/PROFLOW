import type { NextRequest } from 'next/server';

/** Backend-only Vercel log diagnostics. No PII, no secrets, one line per event. */
export function isUsageRuntimeDiagEnabled(): boolean {
  return process.env.USAGE_RUNTIME_DIAG === '1';
}

export type UsageRouteClass =
  | 'document'
  | 'rsc'
  | 'server_action'
  | 'auth'
  | 'legal'
  | 'employee'
  | 'contractor'
  | 'app'
  | 'api'
  | 'other';

export type UsageUaClass =
  | 'browser'
  | 'googlebot'
  | 'bingbot'
  | 'known_bot'
  | 'uptime_monitor'
  | 'cli'
  | 'unknown_automation'
  | 'internal';

export type UsageWorkerTrigger = 'cron' | 'internal_http' | 'recovery' | 'owner/manual' | 'unknown';

function compact(value: string): string {
  return value.replace(/\s+/g, '_').slice(0, 120);
}

export function classifyUsageUaClass(userAgent: string | null): UsageUaClass {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return 'unknown_automation';
  if (ua.includes('vercel') || ua.includes('node-fetch') || ua.includes('undici')) return 'internal';
  if (ua.includes('googlebot') || ua.includes('adsbot-google')) return 'googlebot';
  if (ua.includes('bingbot') || ua.includes('msnbot')) return 'bingbot';
  if (
    ua.includes('uptimerobot') ||
    ua.includes('pingdom') ||
    ua.includes('statuscake') ||
    ua.includes('betteruptime') ||
    ua.includes('site24x7')
  ) {
    return 'uptime_monitor';
  }
  if (ua.includes('curl/') || ua.includes('wget/') || ua.includes('httpie')) return 'cli';
  if (
    ua.includes('bot') ||
    ua.includes('spider') ||
    ua.includes('crawl') ||
    ua.includes('slurp') ||
    ua.includes('facebookexternalhit') ||
    ua.includes('linkedinbot') ||
    ua.includes('semrush') ||
    ua.includes('ahrefs') ||
    ua.includes('petalbot') ||
    ua.includes('headless')
  ) {
    return 'known_bot';
  }
  if (ua.includes('mozilla/') || ua.includes('chrome/') || ua.includes('safari/') || ua.includes('firefox/')) {
    return 'browser';
  }
  return 'unknown_automation';
}

export function localeFromPathname(pathname: string): string | null {
  const segment = pathname.split('/').filter(Boolean)[0];
  if (segment === 'he-IL' || segment === 'en' || segment === 'ar' || segment === 'ru') return segment;
  return null;
}

export function classifyUsageRouteArea(pathname: string): UsageRouteClass {
  if (pathname.startsWith('/api/')) return 'api';
  if (pathname.startsWith('/auth')) return 'auth';
  const bare = pathname.replace(/^\/(he-IL|en|ar|ru)/, '') || '/';
  if (bare === '/' || bare === '') return 'document';
  if (bare.startsWith('/legal')) return 'legal';
  if (bare.startsWith('/employee')) return 'employee';
  if (bare.startsWith('/contractor')) return 'contractor';
  if (
    bare.startsWith('/sign-in') ||
    bare.startsWith('/sign-up') ||
    bare.startsWith('/forgot-password') ||
    bare.startsWith('/reset-password') ||
    bare.startsWith('/portal-access') ||
    bare.startsWith('/onboarding') ||
    bare.startsWith('/setup')
  ) {
    return 'auth';
  }
  return 'app';
}

export function detectRscRequest(request: NextRequest): boolean {
  return (
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1' ||
    request.headers.get('Next-Router-State-Tree') != null
  );
}

export function detectServerActionRequest(request: NextRequest): boolean {
  return request.headers.get('Next-Action') != null;
}

export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => /auth-token/.test(cookie.name));
}

export function resolveUsageRouteClass(
  pathname: string,
  request: NextRequest,
): UsageRouteClass {
  if (detectServerActionRequest(request)) return 'server_action';
  if (detectRscRequest(request)) return 'rsc';
  return classifyUsageRouteArea(pathname);
}

export function logUsageRequestDiag(request: NextRequest, pathname: string): void {
  if (!isUsageRuntimeDiagEnabled()) return;
  const routeClass = resolveUsageRouteClass(pathname, request);
  const line = [
    'tag=PF_USAGE_DIAG',
    `ts=${new Date().toISOString()}`,
    `method=${request.method}`,
    `pathname=${compact(pathname)}`,
    `routeClass=${routeClass}`,
    `hasAuthCookie=${hasSupabaseAuthCookie(request) ? 'yes' : 'no'}`,
    `rsc=${detectRscRequest(request) ? 'yes' : 'no'}`,
    `serverAction=${detectServerActionRequest(request) ? 'yes' : 'no'}`,
    `uaClass=${classifyUsageUaClass(request.headers.get('user-agent'))}`,
    `locale=${localeFromPathname(pathname) ?? 'none'}`,
  ].join(' ');
  console.info(line);
}

export function inferWorkerTrigger(request: Request): UsageWorkerTrigger {
  if (request.headers.get('x-vercel-cron') === '1') return 'cron';
  const auth = request.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return 'internal_http';
  return 'unknown';
}

export interface UsageWorkerEndStats {
  readonly processed?: number;
  readonly remaining?: number;
  readonly chain?: number;
  readonly nextHop?: boolean;
  readonly rateLimited?: boolean;
  readonly responseBytes?: number;
}

export function logUsageWorkerStart(worker: string, trigger: UsageWorkerTrigger): void {
  if (!isUsageRuntimeDiagEnabled()) return;
  console.info(`tag=PF_USAGE_WORKER phase=start worker=${compact(worker)} trigger=${trigger}`);
}

export function logUsageWorkerEnd(
  worker: string,
  trigger: UsageWorkerTrigger,
  startedMs: number,
  stats: UsageWorkerEndStats = {},
): void {
  if (!isUsageRuntimeDiagEnabled()) return;
  const parts = [
    'tag=PF_USAGE_WORKER',
    'phase=end',
    `worker=${compact(worker)}`,
    `trigger=${trigger}`,
    `durationMs=${Date.now() - startedMs}`,
  ];
  if (stats.processed !== undefined) parts.push(`processed=${stats.processed}`);
  if (stats.remaining !== undefined) parts.push(`remaining=${stats.remaining}`);
  if (stats.chain !== undefined) parts.push(`chain=${stats.chain}`);
  if (stats.nextHop !== undefined) parts.push(`nextHop=${stats.nextHop ? 'yes' : 'no'}`);
  if (stats.rateLimited !== undefined) parts.push(`rateLimited=${stats.rateLimited ? 'yes' : 'no'}`);
  if (stats.responseBytes !== undefined) parts.push(`responseBytes=${stats.responseBytes}`);
  console.info(parts.join(' '));
}

export function logUsageSelfHttp(input: {
  readonly fromModule: string;
  readonly toPath: string;
  readonly chain?: number;
  readonly reason: string;
}): void {
  if (!isUsageRuntimeDiagEnabled()) return;
  console.info(
    [
      'tag=PF_USAGE_SELF_HTTP',
      `from=${compact(input.fromModule)}`,
      `toPath=${compact(input.toPath)}`,
      input.chain !== undefined ? `chain=${input.chain}` : null,
      `reason=${compact(input.reason)}`,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

export async function measureJsonResponseBytes(response: Response): Promise<number> {
  try {
    const clone = response.clone();
    const buf = await clone.arrayBuffer();
    return buf.byteLength;
  } catch {
    return 0;
  }
}
