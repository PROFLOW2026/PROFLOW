'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

interface PortfolioPaginationProps {
  currentPage: number;
  totalPages: number;
  perPage: number;
  totalCount: number;
  currentParams: Record<string, string | undefined>;
}

function makePageHref(
  currentParams: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(currentParams)) {
    if (v && k !== 'page') params.set(k, v);
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/portfolio${qs ? `?${qs}` : ''}`;
}

export function PortfolioPagination({
  currentPage,
  totalPages,
  perPage,
  totalCount,
  currentParams,
}: PortfolioPaginationProps) {
  const t = useTranslations('tasks.portfolio.pagination');
  const start = (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, totalCount);

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
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
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('showing', { start, end, total: totalCount })}
      </p>
      <nav aria-label={t('label')} className="flex items-center gap-1">
        {currentPage > 1 ? (
          <Link
            href={makePageHref(currentParams, currentPage - 1)}
            className="rounded-md border border-[var(--pf-border)] px-3 py-1.5 text-sm hover:bg-[var(--pf-bg-secondary)]"
          >
            ←
          </Link>
        ) : (
          <span className="rounded-md border border-[var(--pf-border)] px-3 py-1.5 text-sm opacity-40 cursor-not-allowed">
            ←
          </span>
        )}

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-[var(--pf-text-muted)]">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={makePageHref(currentParams, p)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm',
                p === currentPage
                  ? 'border-[var(--pf-ring)] bg-[var(--pf-bg-accent)] font-semibold'
                  : 'border-[var(--pf-border)] hover:bg-[var(--pf-bg-secondary)]',
              )}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </Link>
          ),
        )}

        {currentPage < totalPages ? (
          <Link
            href={makePageHref(currentParams, currentPage + 1)}
            className="rounded-md border border-[var(--pf-border)] px-3 py-1.5 text-sm hover:bg-[var(--pf-bg-secondary)]"
          >
            →
          </Link>
        ) : (
          <span className="rounded-md border border-[var(--pf-border)] px-3 py-1.5 text-sm opacity-40 cursor-not-allowed">
            →
          </span>
        )}
      </nav>
    </div>
  );
}
