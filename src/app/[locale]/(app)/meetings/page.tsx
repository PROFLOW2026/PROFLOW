import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { countMeetingsForOrg, listMeetingsForOrg } from '@/modules/meetings';
import { QueryPagination } from '@/components/ui/query-pagination';
import {
  ORG_LIST_PAGE_SIZE,
  orgListOffset,
  orgListPageCount,
  parseOrgListPage,
  resolveOrgListPage,
} from '@/shared/db/org-list-pagination';
import { getTranslations } from 'next-intl/server';
import type { MeetingListFilters } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params: _params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return { title: 'Meetings' };
}

interface MeetingsPageProps {
  searchParams: Promise<{
    project?: string;
    workspace?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

export default async function MeetingsPage({ searchParams }: MeetingsPageProps) {
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.MEETINGS_READ)) {
    notFound();
  }

  const canManage = shell.permissions.has(PERMISSIONS.MEETINGS_MANAGE);
  const [params, tCommon] = await Promise.all([searchParams, getTranslations('common')]);
  const requestedPage = parseOrgListPage(params.page);

  const baseFilters: MeetingListFilters = {
    projectId: params.project || undefined,
    workspaceId: params.workspace || undefined,
    fromDate: params.from ? new Date(params.from) : undefined,
    toDate: params.to ? new Date(params.to) : undefined,
  };

  const { meetings, totalCount, currentPage, totalPages } = await withOrgContext(async (context) => {
    const total = await countMeetingsForOrg(context, baseFilters);
    const page = resolveOrgListPage(total, requestedPage);
    const rows = await listMeetingsForOrg(context, {
      ...baseFilters,
      limit: ORG_LIST_PAGE_SIZE,
      offset: orgListOffset(page),
    });
    return {
      meetings: rows,
      totalCount: total,
      currentPage: page,
      totalPages: orgListPageCount(total),
    };
  });

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title="Meetings"
        description="Meeting records, decisions, and action items"
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/meetings/new" prefetch={false}>
                <Plus aria-hidden className="mr-1 h-4 w-4" />
                New Meeting
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Filters row */}
      <form method="get" className="flex flex-wrap gap-2">
        {params.project && <input type="hidden" name="project" value={params.project} />}
        {params.workspace && <input type="hidden" name="workspace" value={params.workspace} />}
        {params.from && (
          <div className="flex items-center gap-1 text-sm">
            <span className="text-[var(--pf-text-secondary)]">From:</span>
            <span>{params.from}</span>
            <Link href="/meetings" className="text-xs text-[var(--pf-accent)] hover:underline ml-1">
              Clear
            </Link>
          </div>
        )}
      </form>

      {meetings.length === 0 ? (
        <EmptyState
          title="No meetings yet"
          description={canManage ? 'Create your first meeting to start tracking decisions.' : 'No meetings have been recorded yet.'}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/meetings/new" prefetch={false}>
                  <Plus aria-hidden className="mr-1 h-4 w-4" />
                  New Meeting
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Attendees</TableHead>
                <TableHead>Decisions</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((meeting) => (
                <TableRow key={meeting.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/meetings/${meeting.id}`}
                      className={cn(textNavLinkClassName, 'rounded-sm')}
                    >
                      {meeting.title}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-[var(--pf-text-secondary)]">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" aria-hidden />
                      {formatMeetingDate(meeting.scheduledAt)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-[var(--pf-text-secondary)]">
                    {meeting.location ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {meeting.location}
                      </span>
                    ) : (
                      <span className="text-[var(--pf-text-muted)]">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-[var(--pf-text-secondary)]">
                    {meeting.projectName ? (
                      <Link
                        href={`/projects/${meeting.projectId}`}
                        className="hover:underline"
                      >
                        {meeting.projectName}
                      </Link>
                    ) : meeting.workspaceName ? (
                      meeting.workspaceName
                    ) : (
                      <span className="text-[var(--pf-text-muted)]">Org-wide</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-[var(--pf-text-secondary)]" aria-hidden />
                      {meeting.attendeeCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{meeting.decisionCount}</TableCell>
                  <TableCell className="text-sm tabular-nums">{meeting.actionItemCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <QueryPagination
        basePath="/meetings"
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={ORG_LIST_PAGE_SIZE}
        currentParams={{
          project: params.project,
          workspace: params.workspace,
          from: params.from,
          to: params.to,
        }}
        previousLabel={tCommon('actions.previous')}
        nextLabel={tCommon('actions.next')}
        pageOfLabel={tCommon('pagination.pageOf', { page: currentPage, pageCount: totalPages })}
        navLabel={tCommon('pagination.navLabel')}
      />
    </div>
  );
}

function formatMeetingDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
