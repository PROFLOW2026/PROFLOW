import {
  MainAppListBody,
  MainAppListPagination,
  MainAppPage,
  MainAppSection,
  MainAppTableShell,
} from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { countMeetingsForOrg, listMeetingsForOrg } from '@/modules/meetings';
import { OwnerMeetingsFilterBar } from '@/modules/meetings/ui/owner-meetings-filter-bar';
import {
  orgListOffset,
  orgListPageCount,
  parseOrgListPage,
  resolveOrgListPage,
} from '@/shared/db/org-list-pagination';
import {
  MAIN_APP_DEFAULT_LIST_PAGE_SIZE,
  parseMainAppListPageSize,
} from '@/shared/db/main-app-list-page-size';
import { getLocale, getTranslations } from 'next-intl/server';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import type { MeetingListFilters } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { loadProjectDisplayNameMap } from '@/modules/projects/application/project-display-names';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.pageTitle') };
}

interface MeetingsPageProps {
  searchParams: Promise<{
    project?: string;
    workspace?: string;
    from?: string;
    to?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function MeetingsPage({ searchParams }: MeetingsPageProps) {
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.MEETINGS_READ)) {
    notFound();
  }

  const canManage = shell.permissions.has(PERMISSIONS.MEETINGS_MANAGE);
  const [params, t, tCommon, locale] = await Promise.all([
    searchParams,
    getTranslations('tasks'),
    getTranslations('common'),
    getLocale(),
  ]);
  const pageSize = parseMainAppListPageSize(params.pageSize, MAIN_APP_DEFAULT_LIST_PAGE_SIZE);
  const requestedPage = parseOrgListPage(params.page);

  const baseFilters: MeetingListFilters = {
    projectId: params.project || undefined,
    workspaceId: params.workspace || undefined,
    fromDate: params.from ? new Date(`${params.from}T00:00:00.000Z`) : undefined,
    toDate: params.to ? new Date(`${params.to}T23:59:59.999Z`) : undefined,
    search: params.q || undefined,
  };

  const { meetings, totalCount, currentPage, totalPages, projectOptions } = await withOrgContext(
    async (context) => {
      const total = await countMeetingsForOrg(context, baseFilters);
      const page = resolveOrgListPage(total, requestedPage, pageSize);
      const rows = await listMeetingsForOrg(context, {
        ...baseFilters,
        limit: pageSize,
        offset: orgListOffset(page, pageSize),
      });
      const projectIds = [...new Set(rows.map((row) => row.projectId).filter(Boolean) as string[])];
      const labels = await loadProjectDisplayNameMap(context.db, context.organizationId, projectIds);
      const projectOptions = [...labels.entries()]
        .map(([id, displayName]) => ({ id, displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return {
        meetings: rows,
        totalCount: total,
        currentPage: page,
        totalPages: orgListPageCount(total, pageSize),
        projectOptions,
      };
    },
  );

  return (
    <MainAppPage>
      <PageHeader
        title={t('meetings.pageTitle')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/meetings/new" prefetch={false}>
                <Plus aria-hidden className="me-1 h-4 w-4" />
                {t('meetings.newMeeting')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <MainAppSection>
        <MainAppListBody>
        <Suspense fallback={null}>
        <OwnerMeetingsFilterBar projectOptions={projectOptions} totalCount={totalCount} />
      </Suspense>

      {meetings.length === 0 ? (
        <EmptyState
          title={t('meetings.emptyFiltered', { defaultValue: t('meetings.empty') })}
          description={
            canManage ? t('meetings.emptyDescriptionManage') : t('meetings.emptyDescriptionRead')
          }
          action={
            canManage ? (
              <Button asChild>
                <Link href="/meetings/new" prefetch={false}>
                  <Plus aria-hidden className="me-1 h-4 w-4" />
                  {t('meetings.newMeeting')}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <MainAppTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('meetings.fields.title')}</TableHead>
                <TableHead>{t('meetings.fields.date')}</TableHead>
                <TableHead>{t('meetings.fields.location')}</TableHead>
                <TableHead>{t('meetings.table.context')}</TableHead>
                <TableHead>{t('meetings.fields.attendees')}</TableHead>
                <TableHead>{t('meetings.fields.decisions')}</TableHead>
                <TableHead>{t('meetings.table.actions')}</TableHead>
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
                      {formatMeetingDate(meeting.scheduledAt, locale)}
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
                      <Link href={`/projects/${meeting.projectId}`} className="hover:underline">
                        {meeting.projectName}
                      </Link>
                    ) : meeting.workspaceName ? (
                      meeting.workspaceName
                    ) : (
                      <span className="text-[var(--pf-text-muted)]">{t('meetings.context.orgWide')}</span>
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
        </MainAppTableShell>
      )}

      <MainAppListPagination
        basePath="/meetings"
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        currentParams={{
          project: params.project,
          workspace: params.workspace,
          from: params.from,
          to: params.to,
          q: params.q,
        }}
        previousLabel={tCommon('actions.previous')}
        nextLabel={tCommon('actions.next')}
        pageOfLabel={tCommon('pagination.pageOf', { page: currentPage, pageCount: totalPages })}
        navLabel={tCommon('pagination.navLabel')}
        rowsPerPageLabel={tCommon('pagination.rowsPerPage')}
      />
        </MainAppListBody>
      </MainAppSection>
    </MainAppPage>
  );
}

function formatMeetingDate(date: Date, locale: string): string {
  return intlDateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
