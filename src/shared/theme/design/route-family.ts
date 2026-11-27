/**
 * Every App Router page maps to exactly one family.
 * Excluded families stay on the current product chrome.
 * The unit test enumerates src/app page.tsx files against this function.
 */

export const DESIGN_ROUTE_FAMILIES = [
  'dev-harness',
  'public-auth',
  'public-live',
  'home-dual',
  'engine',
  'print',
  'settings',
  'finance',
  'surface-home',
  'project-home',
  'form',
  'detail',
  'list',
] as const;

export type DesignRouteFamily = (typeof DESIGN_ROUTE_FAMILIES)[number];

export const EXCLUDED_DESIGN_FAMILIES = ['dev-harness', 'public-auth', 'public-live'] as const;

export type ExcludedDesignFamily = (typeof EXCLUDED_DESIGN_FAMILIES)[number];

/** Recounted from src/app page.tsx. The coverage test fails if the tree drifts. */
export const EXPECTED_DESIGN_PAGE_COUNT = 440;

const EXCLUSION_REASON: Record<ExcludedDesignFamily, string> = {
  'dev-harness': 'Development harness, including the design lab. Not a product screen.',
  'public-auth': 'Signed-out or pre-session page. The design switcher is not shown.',
  'public-live': 'Public live-camera viewer. The player stays outside the product shells.',
};

export function isExcludedDesignFamily(family: DesignRouteFamily): family is ExcludedDesignFamily {
  return (EXCLUDED_DESIGN_FAMILIES as readonly string[]).includes(family);
}

export function designExclusionReason(family: ExcludedDesignFamily): string {
  return EXCLUSION_REASON[family];
}

function isForm(rel: string): boolean {
  return /\/(new|edit|allocate|approve|price|add|create-task|connect-developer)(\/|$)/.test(rel);
}

function isEngine(rel: string): boolean {
  return (
    rel.includes('/takeoff/') ||
    rel.endsWith('/takeoff/page.tsx') ||
    rel.includes('/infrastructure/') ||
    rel.includes('/boq-measure/') ||
    rel.includes('/plans/')
  );
}

function isFinance(rel: string): boolean {
  return (
    rel.includes('/(app)/financials/') ||
    rel.includes('/(app)/cash-flow/') ||
    rel.includes('/(app)/month-close/') ||
    rel.includes('/(app)/overhead/') ||
    rel.includes('/(app)/reports/')
  );
}

function isSurfaceHome(rel: string): boolean {
  return (
    rel.endsWith('/employee/(shell)/page.tsx') ||
    rel.endsWith('/contractor/(portal)/page.tsx') ||
    rel.endsWith('/contractor/(portal)/finance/page.tsx') ||
    rel.endsWith('/contractor/(portal)/work/page.tsx') ||
    rel.endsWith('/contractor/(portal)/more/page.tsx') ||
    rel.endsWith('/(app)/today/page.tsx') ||
    rel.endsWith('/(app)/operations/page.tsx')
  );
}

function isProjectHome(rel: string): boolean {
  return /\/projects\/\[projectId\]\/page\.tsx$/.test(rel);
}

function isPublicAuth(rel: string): boolean {
  if (rel.includes('/settings/')) return false;
  return (
    rel.includes('/(auth)/') ||
    rel.includes('/legal/') ||
    rel.includes('/demo/') ||
    rel.includes('/onboarding/') ||
    rel.includes('/setup/') ||
    rel.includes('/supplier-rfq/') ||
    rel.includes('/employee/(public)/') ||
    rel.includes('/contractor/(auth)/') ||
    rel.includes('/portal/') ||
    rel.endsWith('/portal/page.tsx')
  );
}

/** `[locale]` is on every page. Only other dynamic segments are detail ids. */
function hasRecordId(rel: string): boolean {
  return rel.replaceAll('[locale]', '').includes('[');
}

export function classifyDesignRoute(rel: string): DesignRouteFamily {
  const path = rel.replaceAll('\\', '/');
  if (path.includes('/dev/')) return 'dev-harness';
  if (path === 'src/app/[locale]/page.tsx') return 'home-dual';
  if (path.includes('/live/')) return 'public-live';
  if (isPublicAuth(path)) return 'public-auth';
  if (isEngine(path)) return 'engine';
  if (path.includes('/print/')) return 'print';
  if (path.includes('/settings/') || path.endsWith('/settings/page.tsx') || path.includes('/quotes/settings/')) {
    return 'settings';
  }
  if (isFinance(path)) return 'finance';
  if (isSurfaceHome(path)) return 'surface-home';
  if (isProjectHome(path)) return 'project-home';
  if (isForm(path)) return 'form';
  if (hasRecordId(path)) return 'detail';
  return 'list';
}

const HREF_LOCALES = new Set(['he-IL', 'en', 'ru', 'ar']);
const FORM_SEGMENTS = new Set(['new', 'edit', 'allocate', 'approve', 'price', 'add', 'create-task', 'connect-developer']);

function hrefParts(pathname: string): string[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && HREF_LOCALES.has(parts[0]!)) return parts.slice(1);
  return parts;
}

function isPublicHref(path: string): boolean {
  return (
    path.startsWith('sign-') ||
    path.startsWith('legal') ||
    path.startsWith('demo') ||
    path.startsWith('onboarding') ||
    path.startsWith('setup') ||
    path.startsWith('supplier-rfq') ||
    path.startsWith('portal') ||
    path.startsWith('employee/sign-') ||
    path.startsWith('contractor/sign-') ||
    path.startsWith('forgot') ||
    path.startsWith('reset')
  );
}

function isFinanceHref(path: string): boolean {
  if (path.startsWith('employee/') || path.startsWith('contractor/')) return false;
  return /^(financials|cash-flow|month-close|overhead|reports)(\/|$)/.test(path);
}

function isSurfaceHref(path: string): boolean {
  return (
    path === 'employee' ||
    path === 'contractor' ||
    path === 'contractor/finance' ||
    path === 'contractor/work' ||
    path === 'contractor/more' ||
    path === 'today' ||
    path === 'operations'
  );
}

function isEngineHref(path: string): boolean {
  return /(^|\/)(takeoff|infrastructure|boq-measure|plans)(\/|$)/.test(path);
}

function isProjectHomeHref(path: string): boolean {
  return /^(employee\/|contractor\/)?projects\/[^/]+$/.test(path);
}

function isDetailHref(parts: string[], path: string): boolean {
  if (/^(employee\/|contractor\/)?projects\/[^/]+\/.+/.test(path)) return true;
  return parts.some((segment) => /^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(segment) || segment.length >= 20);
}

/**
 * Runtime family for the shell frame. Same decisions as classifyDesignRoute,
 * applied to the live pathname (with or without the locale prefix).
 */
export function classifyDesignHref(pathname: string): DesignRouteFamily {
  const parts = hrefParts(pathname);
  const path = parts.join('/');
  if (path === 'dev' || path.startsWith('dev/')) return 'dev-harness';
  if (path === 'live' || path.startsWith('live/')) return 'public-live';
  if (isPublicHref(path)) return 'public-auth';
  if (path === '') return 'home-dual';
  if (isEngineHref(path)) return 'engine';
  if (path === 'print' || path.startsWith('print/') || path.includes('/print/') || path.endsWith('/print')) return 'print';
  if (path === 'settings' || path.startsWith('settings/') || path.includes('/settings') || path.includes('quotes/settings')) {
    return 'settings';
  }
  if (isFinanceHref(path)) return 'finance';
  if (isSurfaceHref(path)) return 'surface-home';
  if (isProjectHomeHref(path)) return 'project-home';
  if (parts.some((segment) => FORM_SEGMENTS.has(segment))) return 'form';
  if (isDetailHref(parts, path)) return 'detail';
  return 'list';
}

/** Families whose V9/V10 difference is structure, not only tokens. */
export function familyUsesStructuralTemplate(family: DesignRouteFamily): boolean {
  return (
    family === 'home-dual' ||
    family === 'finance' ||
    family === 'surface-home' ||
    family === 'project-home' ||
    family === 'form' ||
    family === 'detail' ||
    family === 'list' ||
    family === 'settings'
  );
}

/**
 * Landmark the product body carries for this family.
 * print stays tokens-only. Engine pages stay chrome-only. The signed-in home
 * carries a structural landmark only. Money copy stays on the finance switch
 * that already computed the figure.
 */
export function familyBodyLandmark(family: DesignRouteFamily, design: 'v9' | 'v10'): string | undefined {
  if (family === 'print' || family === 'engine') return undefined;
  if (family === 'home-dual') return design === 'v9' ? 'v9-hero' : 'v10-glance';
  if (family === 'settings') return design === 'v9' ? 'v9-settings' : 'v10-settings';
  if (family === 'list') return design === 'v9' ? 'v9-table' : 'v10-scan';
  if (family === 'finance') return design === 'v9' ? 'v9-editorial' : 'v10-glance';
  if (family === 'project-home') return design === 'v9' ? 'v9-hero' : 'v10-glance';
  if (family === 'surface-home') return design === 'v9' ? 'v9-editorial' : 'v10-command';
  if (family === 'form') return design === 'v9' ? 'v9-form' : 'v10-form';
  if (family === 'detail') return design === 'v9' ? 'v9-facts' : 'v10-detail';
  return undefined;
}

/** Product pages are covered by a shell that mounts the design frame. */
export function productRouteUsesDesignShell(rel: string): boolean {
  const family = classifyDesignRoute(rel);
  if (isExcludedDesignFamily(family)) return false;
  if (family === 'home-dual') return true;
  const path = rel.replaceAll('\\', '/');
  return (
    path.includes('/(app)/') ||
    path.includes('/employee/(shell)/') ||
    path.includes('/contractor/(portal)/')
  );
}
