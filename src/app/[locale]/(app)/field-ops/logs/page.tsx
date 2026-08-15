import { HardHat, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { DAILY_LOG_STATUSES, listDailyLogsForOrg } from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { FieldOpsSectionNav } from '../field-ops-section-nav';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('nav.logs') };
}

export default async function FieldOpsLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: string }>;
}) {
  const t = await getTranslations('fieldOps');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const { projectId, status: statusRaw } = await searchParams;
  const status =
    statusRaw && (DAILY_LOG_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as (typeof DAILY_LOG_STATUSES)[number])
      : undefined;

  const { logs, projects, canManage } = await withOrgContext(async (context) => {
    const [logRows, projectRows] = await Promise.all([
      listDailyLogsForOrg(context, { projectId, status }),
      listProjectsForOrg(context, {}),
    ]);
    return {
      logs: logRows,
      projects: projectRows,
      canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
    };
  });

  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.logs')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link
                href={
                  projectId ? `/field-ops/logs/new?projectId=${projectId}` : '/field-ops/logs/new'
                }
              >
                <Plus aria-hidden />
                {t('newLog')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FieldOpsSectionNav active="logs" />

      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
        <label className="flex flex-col gap-1 text-sm sm:w-44">
          <span className="text-[var(--pf-text-secondary)]">{t('filters.status')}</span>
          <select
            name="status"
            defaultValue={status ?? 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]"
          >
            <option value="all">{t('filters.all')}</option>
            {DAILY_LOG_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`logStatus.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary" className="min-h-11 w-full sm:w-auto">
          {tCommon('actions.filter')}
        </Button>
      </form>

      {logs.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title={t('empty.logs.title')}
          description={t('empty.logs.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/field-ops/logs/new">{t('empty.logs.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={logs}
          getRowKey={(log) => log.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.date')}</TableHead>
                    <TableHead>{t('list.columns.project')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead>{t('list.columns.summary')}</TableHead>
                    <TableHead>{t('list.columns.weather')}</TableHead>
                    <TableHead>{t('list.columns.workforce')}</TableHead>
                    <TableHead>{t('list.columns.blockers')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Link
                          href={`/field-ops/logs/${log.id}`}
                          className={cn(textNavLinkClassName, 'pf-ltr-island')}
                          dir="ltr"
                        >
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                            new Date(log.logDate),
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>{projectName.get(log.projectId) ?? '—'}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={
                            log.status === 'finalized'
                              ? 'completed'
                              : log.status === 'submitted'
                                ? 'pending'
                                : 'draft'
                          }
                          label={t(`logStatus.${log.status}`)}
                        />
                      </TableCell>
                      <TableCell className="max-w-md truncate font-medium">
                        <Link href={`/field-ops/logs/${log.id}`} className={textNavLinkClassName}>
                          {log.summary}
                        </Link>
                      </TableCell>
                      <TableCell>{log.weather ?? '—'}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {log.workforceNotes ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{log.blockers ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(log) => (
            <Link
              href={`/field-ops/logs/${log.id}`}
              className={pressableCardLinkClassName}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-semibold">{log.summary}</p>
                <StatusBadge
                  shape={
                    log.status === 'finalized'
                      ? 'completed'
                      : log.status === 'submitted'
                        ? 'pending'
                        : 'draft'
                  }
                  label={t(`logStatus.${log.status}`)}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                <span className="pf-ltr-island" dir="ltr">
                  {log.logDate}
                </span>
                {' · '}
                {projectName.get(log.projectId) ?? '—'}
                {log.weather ? ` · ${log.weather}` : ''}
              </p>
              {log.workforceNotes ? (
                <p className="mt-2 line-clamp-2 text-sm text-[var(--pf-text-secondary)]">
                  {log.workforceNotes}
                </p>
              ) : null}
              {log.blockers ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--pf-status-danger-fg)]">
                  {t('list.columns.blockers')}: {log.blockers}
                </p>
              ) : null}
            </Link>
          )}
        />
      )}
    </div>
  );
}
