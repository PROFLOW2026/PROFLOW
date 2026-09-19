import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getPortfolio } from '@/modules/tasks/application/get-portfolio';
import { HealthDot } from '@/modules/tasks/ui/health-dot';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { PortfolioPagination } from './portfolio-pagination';
import { PortfolioFiltersBar } from './portfolio-filters-bar';

export const metadata: Metadata = { title: 'Portfolio' };

// ---------------------------------------------------------------------------
// URL search params schema
// ---------------------------------------------------------------------------

interface PortfolioPageProps {
  searchParams: Promise<{
    clientId?: string;
    stageId?: string;
    workKind?: string;
    status?: string;
    has_overdue?: string;
    stale?: string;
    employeeId?: string;
    labelId?: string;
    page?: string;
    per_page?: string;
  }>;
}

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];

function resolvePerPage(raw: string | undefined): PerPageOption {
  const n = parseInt(raw ?? '25', 10);
  if ((PER_PAGE_OPTIONS as readonly number[]).includes(n)) return n as PerPageOption;
  return 25;
}

function resolveStatusBadgeTone(status: string) {
  if (status === 'active') return 'success' as const;
  if (status === 'on_hold') return 'warning' as const;
  if (status === 'completed') return 'neutral' as const;
  return 'neutral' as const;
}

function formatLastActivity(date: Date | null): string {
  if (!date) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const [params, shell] = await Promise.all([searchParams, getShellContext()]);

  const canRead = shell?.permissions.has(PERMISSIONS.PORTFOLIO_READ) ?? false;

  const perPage = resolvePerPage(params.per_page);
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const offset = (page - 1) * perPage;

  const { rows, totalCount } = await withOrgContext(async (context) => {
    if (!canRead) return { rows: [], totalCount: 0 };
    return getPortfolio(context, {
      clientId: params.clientId || null,
      stageId: params.stageId || null,
      workKind: params.workKind || null,
      status: params.status || null,
      hasOverdue: params.has_overdue === 'true',
      stale: params.stale === 'true',
      employeeId: params.employeeId || null,
      labelId: params.labelId || null,
      limit: perPage,
      offset,
    });
  });

  const totalPages = Math.ceil(totalCount / perPage);
  const hasFilters = Boolean(
    params.clientId ||
      params.stageId ||
      params.workKind ||
      params.status ||
      params.has_overdue ||
      params.stale ||
      params.employeeId ||
      params.labelId,
  );

  if (!canRead) {
    return (
      <div className="flex min-w-0 max-w-full flex-col gap-6">
        <PageHeader title="Portfolio" />
        <EmptyState
          title="Access restricted"
          description="You need the portfolio.read permission to view the portfolio dashboard."
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title="Portfolio"
        description={`${totalCount} project${totalCount === 1 ? '' : 's'}`}
      />

      {/* Filter bar */}
      <PortfolioFiltersBar currentParams={params} />

      {/* Saved views */}
      <SavedListViewsBar
        listKey="portfolio"
        searchParams={{
          clientId: params.clientId,
          stageId: params.stageId,
          workKind: params.workKind,
          status: params.status,
          has_overdue: params.has_overdue,
          stale: params.stale,
          employeeId: params.employeeId,
          labelId: params.labelId,
        }}
        keys={['clientId', 'stageId', 'workKind', 'status', 'has_overdue', 'stale', 'employeeId', 'labelId']}
      />

      {rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No projects match the current filters"
            description="Try adjusting your filters to see more results."
            action={
              <Link
                href="/portfolio"
                className="rounded-md bg-[var(--pf-bg-secondary)] px-4 py-2 text-sm font-medium hover:bg-[var(--pf-bg-secondary-hover)]"
              >
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No projects in portfolio"
            description="Create a project to see it tracked here."
          />
        )
      ) : (
        <>
          {/* Portfolio table */}
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead numeric>Open</TableHead>
                  <TableHead numeric>Overdue</TableHead>
                  <TableHead numeric>Blocked</TableHead>
                  <TableHead>Next Milestone</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.projectId}>
                    {/* Project name */}
                    <TableCell>
                      <Link
                        href={`/projects/${row.projectId}`}
                        className={cn(textNavLinkClassName, 'rounded-sm font-medium')}
                      >
                        {row.name}
                      </Link>
                      {row.workKind !== 'project' && (
                        <span className="ml-2 rounded bg-[var(--pf-bg-tertiary)] px-1 py-0.5 text-[10px] text-[var(--pf-text-muted)] uppercase tracking-wide">
                          {row.workKind}
                        </span>
                      )}
                    </TableCell>

                    {/* Client */}
                    <TableCell className="text-[var(--pf-text-secondary)]">
                      {row.clientName ?? <span className="text-[var(--pf-text-muted)]">—</span>}
                    </TableCell>

                    {/* Stage */}
                    <TableCell className="text-[var(--pf-text-secondary)]">
                      {row.currentStage ?? <span className="text-[var(--pf-text-muted)]">—</span>}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge tone={resolveStatusBadgeTone(row.status)}>
                        {row.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>

                    {/* Open tasks */}
                    <TableCell numeric>
                      <span className={row.openTasks > 0 ? 'font-medium' : 'text-[var(--pf-text-muted)]'}>
                        {row.openTasks}
                      </span>
                    </TableCell>

                    {/* Overdue tasks */}
                    <TableCell numeric>
                      {row.overdueTasks > 0 ? (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {row.overdueTasks}
                        </span>
                      ) : (
                        <span className="text-[var(--pf-text-muted)]">0</span>
                      )}
                    </TableCell>

                    {/* Blocked tasks */}
                    <TableCell numeric>
                      {row.blockedTasks > 0 ? (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {row.blockedTasks}
                        </span>
                      ) : (
                        <span className="text-[var(--pf-text-muted)]">0</span>
                      )}
                    </TableCell>

                    {/* Next milestone */}
                    <TableCell className="max-w-[200px] truncate text-sm text-[var(--pf-text-secondary)]">
                      {row.nextMilestone ?? <span className="text-[var(--pf-text-muted)]">—</span>}
                    </TableCell>

                    {/* Last activity */}
                    <TableCell className="text-sm text-[var(--pf-text-secondary)]">
                      {formatLastActivity(row.lastActivityAt)}
                    </TableCell>

                    {/* Health dot */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <HealthDot
                          level={row.healthLevel}
                          score={row.healthScore}
                        />
                        <span className="text-xs text-[var(--pf-text-muted)]">
                          {row.healthScore}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <PortfolioPagination
              currentPage={page}
              totalPages={totalPages}
              perPage={perPage}
              totalCount={totalCount}
              currentParams={params}
            />
          )}

          {/* Per-page selector */}
          <div className="flex items-center justify-end gap-2 text-sm text-[var(--pf-text-secondary)]">
            <span>Rows per page:</span>
            {PER_PAGE_OPTIONS.map((opt) => {
              const qs = new URLSearchParams();
              for (const [k, v] of Object.entries(params)) {
                if (v && k !== 'per_page' && k !== 'page') qs.set(k, v);
              }
              qs.set('per_page', String(opt));
              return (
                <Link
                  key={opt}
                  href={`/portfolio?${qs.toString()}`}
                  className={cn(
                    'rounded px-2 py-1 hover:bg-[var(--pf-bg-secondary)]',
                    perPage === opt && 'bg-[var(--pf-bg-accent)] font-semibold',
                  )}
                >
                  {opt}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
