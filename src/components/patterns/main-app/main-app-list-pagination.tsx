'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { LtrIsland } from '@/shared/i18n/ltr-island';
import { QueryPagination } from '@/components/ui/query-pagination';
import {
  MAIN_APP_DEFAULT_LIST_PAGE_SIZE,
  MAIN_APP_LIST_PAGE_SIZES,
  parseMainAppListPageSize,
  type MainAppListPageSize,
} from '@/shared/db/main-app-list-page-size';

function buildListQuery(
  currentParams: Record<string, string | undefined>,
  defaultPageSize: MainAppListPageSize,
  patch: { page?: number; pageSize?: MainAppListPageSize },
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (!value || key === 'page' || key === 'pageSize') continue;
    params.set(key, value);
  }
  const pageSize = patch.pageSize ?? parseMainAppListPageSize(currentParams.pageSize, defaultPageSize);
  if (pageSize !== defaultPageSize) {
    params.set('pageSize', String(pageSize));
  }
  const page = patch.page ?? 1;
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface MainAppListPaginationProps {
  basePath: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: MainAppListPageSize;
  defaultPageSize?: MainAppListPageSize;
  currentParams: Record<string, string | undefined>;
  previousLabel: string;
  nextLabel: string;
  pageOfLabel: string;
  navLabel: string;
  rowsPerPageLabel: string;
  className?: string;
}

export function MainAppListPagination({
  basePath,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  defaultPageSize = MAIN_APP_DEFAULT_LIST_PAGE_SIZE,
  currentParams,
  previousLabel,
  nextLabel,
  pageOfLabel,
  navLabel,
  rowsPerPageLabel,
  className,
}: MainAppListPaginationProps) {
  const router = useRouter();

  if (totalCount <= 0) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);
  const paginationParams = {
    ...currentParams,
    pageSize: pageSize === defaultPageSize ? undefined : String(pageSize),
  };

  return (
    <div
      className={className ?? 'flex min-w-0 flex-col gap-3 border-t border-[var(--pf-border-default)] pt-3'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-[38px] items-center gap-2 text-sm text-[var(--pf-text-secondary)]">
          <span>{rowsPerPageLabel}</span>
          <LtrIsland>
            <select
              className="h-[38px] min-h-[38px] rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 text-sm"
              value={pageSize}
              aria-label={rowsPerPageLabel}
              onChange={(event) => {
                const nextSize = parseInt(event.target.value, 10) as MainAppListPageSize;
                if (!MAIN_APP_LIST_PAGE_SIZES.includes(nextSize)) return;
                router.push(
                  `${basePath}${buildListQuery(currentParams, defaultPageSize, { page: 1, pageSize: nextSize })}`,
                );
              }}
            >
              {MAIN_APP_LIST_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </LtrIsland>
        </label>

        {totalPages <= 1 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            <LtrIsland className="tabular-nums">
              {start}–{end} / {totalCount}
            </LtrIsland>
          </p>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <QueryPagination
          basePath={basePath}
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          currentParams={paginationParams}
          previousLabel={previousLabel}
          nextLabel={nextLabel}
          pageOfLabel={pageOfLabel}
          navLabel={navLabel}
        />
      ) : null}
    </div>
  );
}
