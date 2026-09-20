import { Link } from '@/shared/i18n/navigation';
import { LtrIsland } from '@/shared/i18n/ltr-island';
import { cn } from '@/shared/ui/cn';

export interface QueryPaginationProps {
  /** Path without query string, e.g. `/projects`. */
  basePath: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  currentParams: Record<string, string | undefined>;
  previousLabel: string;
  nextLabel: string;
  /** e.g. "Page 2 of 5" — page numbers stay in an LTR island. */
  pageOfLabel: string;
  navLabel?: string;
}

function makePageHref(
  basePath: string,
  currentParams: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (value && key !== 'page') params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `${basePath}${qs ? `?${qs}` : ''}`;
}

function buildPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }

  pages.push(1);
  if (currentPage > 3) pages.push('...');
  for (
    let i = Math.max(2, currentPage - 1);
    i <= Math.min(totalPages - 1, currentPage + 1);
    i++
  ) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) pages.push('...');
  pages.push(totalPages);
  return pages;
}

/**
 * Server-side list pagination: Previous, numbered pages, Next, and page status.
 * Preserves non-page query params when navigating.
 */
export function QueryPagination({
  basePath,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  currentParams,
  previousLabel,
  nextLabel,
  pageOfLabel,
  navLabel = 'Pagination',
}: QueryPaginationProps) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);
  const pages = buildPageNumbers(currentPage, totalPages);

  const pageLinkClass = (active: boolean) =>
    cn(
      'rounded-md border px-3 py-1.5 text-sm',
      active
        ? 'border-[var(--pf-ring)] bg-[var(--pf-bg-accent)] font-semibold'
        : 'border-[var(--pf-border)] hover:bg-[var(--pf-bg-secondary)]',
    );

  const edgeLinkClass =
    'rounded-md border border-[var(--pf-border)] px-3 py-1.5 text-sm hover:bg-[var(--pf-bg-secondary)]';
  const edgeDisabledClass =
    'rounded-md border border-[var(--pf-border)] px-3 py-1.5 text-sm opacity-40 cursor-not-allowed';

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-[var(--pf-text-secondary)]">
        <LtrIsland className="tabular-nums">{pageOfLabel}</LtrIsland>
        {totalCount > 0 ? (
          <>
            {' · '}
            <LtrIsland className="tabular-nums">
              {start}–{end} / {totalCount}
            </LtrIsland>
          </>
        ) : null}
      </p>

      <nav aria-label={navLabel} className="flex flex-wrap items-center justify-center gap-1">
        {currentPage > 1 ? (
          <Link
            href={makePageHref(basePath, currentParams, currentPage - 1)}
            className={edgeLinkClass}
          >
            {previousLabel}
          </Link>
        ) : (
          <span className={edgeDisabledClass}>{previousLabel}</span>
        )}

        {pages.map((page, index) =>
          page === '...' ? (
            <span
              key={`ellipsis-${index}`}
              className="px-2 py-1.5 text-sm text-[var(--pf-text-muted)]"
            >
              …
            </span>
          ) : (
            <Link
              key={page}
              href={makePageHref(basePath, currentParams, page)}
              className={pageLinkClass(page === currentPage)}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </Link>
          ),
        )}

        {currentPage < totalPages ? (
          <Link
            href={makePageHref(basePath, currentParams, currentPage + 1)}
            className={edgeLinkClass}
          >
            {nextLabel}
          </Link>
        ) : (
          <span className={edgeDisabledClass}>{nextLabel}</span>
        )}
      </nav>
    </div>
  );
}
