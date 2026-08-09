import { HardHat, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listDailyLogsForOrg } from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { FieldOpsSectionNav } from '../field-ops-section-nav';

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
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations('fieldOps');
  const locale = await getLocale();
  const { projectId } = await searchParams;

  const { logs, projects, canManage } = await withOrgContext(async (context) => ({
    logs: await listDailyLogsForOrg(context, projectId),
    projects: await listProjectsForOrg(context, {}),
    canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
  }));

  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.logs')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href={projectId ? `/field-ops/logs/new?projectId=${projectId}` : '/field-ops/logs/new'}>
                <Plus aria-hidden />
                {t('newLog')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FieldOpsSectionNav active="logs" />

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
                    <TableHead>{t('list.columns.summary')}</TableHead>
                    <TableHead>{t('list.columns.weather')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                          new Date(log.logDate),
                        )}
                      </TableCell>
                      <TableCell>{projectName.get(log.projectId) ?? '—'}</TableCell>
                      <TableCell className="max-w-md truncate font-medium">{log.summary}</TableCell>
                      <TableCell>{log.weather ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(log) => (
            <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
              <p className="font-semibold">{log.summary}</p>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {log.logDate} · {projectName.get(log.projectId) ?? '—'}
                {log.weather ? ` · ${log.weather}` : ''}
              </p>
            </div>
          )}
        />
      )}
    </div>
  );
}
