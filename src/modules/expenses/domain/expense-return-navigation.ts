import { LOCALES } from '@/shared/i18n/config';

export const EXPENSE_RETURN_TO_PARAM = 'returnTo';

export const EXPENSE_DETAIL_FOCUS_PARAMS = ['allocation', 'classification', 'approval'] as const;
export type ExpenseDetailFocusParam = (typeof EXPENSE_DETAIL_FOCUS_PARAMS)[number];

export type ExpenseBackLabelKey =
  | 'expenses'
  | 'expensesAttention'
  | 'project'
  | 'projectFinancials'
  | 'projectExpenses'
  | 'vendor';

const SAFE_RETURN_TO_PATHS = [
  /^\/expenses$/,
  /^\/projects\/[^/?#]+$/,
  /^\/vendors\/[^/?#]+$/,
  /^\/dashboard$/,
] as const;

function splitPathAndQuery(raw: string): { readonly pathname: string; readonly search: string } {
  const queryIndex = raw.indexOf('?');
  if (queryIndex === -1) {
    return { pathname: raw, search: '' };
  }
  return {
    pathname: raw.slice(0, queryIndex),
    search: raw.slice(queryIndex + 1),
  };
}

/** Strip optional locale prefix so returnTo works with or without `/he-IL`. */
export function stripLocalePrefixFromReturnTo(path: string): string {
  for (const locale of LOCALES) {
    const prefix = `/${locale}`;
    if (path === prefix) return '/';
    if (path.startsWith(`${prefix}/`)) {
      return path.slice(prefix.length) || '/';
    }
  }
  return path;
}

function isSafeReturnToPathname(pathname: string): boolean {
  if (pathname.includes('..') || pathname.includes('\\') || pathname.includes('@')) {
    return false;
  }
  if (pathname.startsWith('/expenses/')) return false;
  return SAFE_RETURN_TO_PATHS.some((pattern) => pattern.test(pathname));
}

/** Accept only safe internal ProjectFlow paths — no open redirects. */
export function parseSafeInternalReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let decoded = raw.trim();
  if (!decoded) return null;

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }

  if (!decoded.startsWith('/')) return null;
  if (decoded.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return null;

  const normalized = stripLocalePrefixFromReturnTo(decoded);
  const { pathname, search } = splitPathAndQuery(normalized);
  if (!isSafeReturnToPathname(pathname)) return null;

  return search ? `${pathname}?${search}` : pathname;
}

export function buildCurrentPathReturnTo(
  pathname: string,
  searchParams: { readonly toString: () => string },
): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildProjectReturnTo(projectId: string, tab: string): string {
  return `/projects/${projectId}?tab=${tab}`;
}

export function buildExpenseDetailHref(
  expenseId: string,
  options: {
    readonly focus?: ExpenseDetailFocusParam;
    readonly returnTo?: string | null;
  } = {},
): string {
  const params = new URLSearchParams();
  if (options.focus) params.set('focus', options.focus);

  const safeReturnTo = options.returnTo ? parseSafeInternalReturnTo(options.returnTo) : null;
  if (safeReturnTo) params.set(EXPENSE_RETURN_TO_PARAM, safeReturnTo);

  const query = params.toString();
  return query ? `/expenses/${expenseId}?${query}` : `/expenses/${expenseId}`;
}

export function resolveExpenseBackLabelKey(returnTo: string): ExpenseBackLabelKey {
  const normalized = stripLocalePrefixFromReturnTo(returnTo.trim());
  const { pathname, search } = splitPathAndQuery(normalized);
  const params = new URLSearchParams(search);

  if (pathname === '/expenses') {
    if (params.get('unallocated') === 'true') return 'expensesAttention';
    const attention = params.get('attention');
    if (
      attention === 'project_allocation' ||
      attention === 'classification' ||
      attention === 'approval'
    ) {
      return 'expensesAttention';
    }
    return 'expenses';
  }

  if (/^\/projects\/[^/?#]+$/.test(pathname)) {
    const tab = params.get('tab');
    if (tab === 'financials') return 'projectFinancials';
    if (tab === 'expenses') return 'projectExpenses';
    return 'project';
  }

  if (/^\/vendors\/[^/?#]+$/.test(pathname)) return 'vendor';

  return 'expenses';
}

export function resolveExpenseBackNavigation(rawReturnTo: string | null | undefined): {
  readonly href: string;
  readonly labelKey: ExpenseBackLabelKey;
  readonly safeReturnTo: string | null;
} {
  const safeReturnTo = parseSafeInternalReturnTo(rawReturnTo);
  if (!safeReturnTo) {
    return { href: '/expenses', labelKey: 'expenses', safeReturnTo: null };
  }
  return {
    href: safeReturnTo,
    labelKey: resolveExpenseBackLabelKey(safeReturnTo),
    safeReturnTo,
  };
}
