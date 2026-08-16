import { Plus, ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  SAFETY_RECORD_STATUSES,
  SAFETY_RECORD_TYPES,
  SAFETY_SEVERITIES,
  getSafetySummaryForOrg,
  listSafetyRecordsForOrg,
  type SafetyRecordStatus,
  type SafetyRecordType,
  type SafetySeverity,
} from '@/modules/safety';
import { safetyRecordStatusShape, safetySeverityShape } from '@/modules/safety/ui';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { SafetyListFilters } from './safety-list-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'safety' });
  return { title: t('title') };
}

function parseType(value: string | undefined): SafetyRecordType | undefined {
  if (value && (SAFETY_RECORD_TYPES as readonly string[]).includes(value)) {
    return value as SafetyRecordType;
  }
  return undefined;
}

function parseStatus(value: string | undefined): SafetyRecordStatus | undefined {
  if (value && (SAFETY_RECORD_STATUSES as readonly string[]).includes(value)) {
    return value as SafetyRecordStatus;
  }
  return undefined;
}

function parseSeverity(value: string | undefined): SafetySeverity | undefined {
  if (value && (SAFETY_SEVERITIES as readonly string[]).includes(value)) {
    return value as SafetySeverity;
  }
  return undefined;
}

export default async function SafetyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; severity?: string; projectId?: string }>;
}) {
  const t = await getTranslations('safety');
  const locale = await getLocale();
  const params = await searchParams;
  const recordType = parseType(params.type);
  const status = parseStatus(params.status);
  const severity = parseSeverity(params.severity);
  const projectId = params.projectId?.trim() || undefined;

  const { records, summary, projects, canManage } = await withOrgContext(async (context) => {
    const [rows, summaryRow, projectRows] = await Promise.all([
      listSafetyRecordsForOrg(context, { recordType, status, severity, projectId }),
      getSafetySummaryForOrg(context),
      listProjectsForOrg(context, {}).catch(() => []),
    ]);
    return {
      records: rows,
      summary: summaryRow,
      projects: projectRows,
      canManage: hasPermission(context, PERMISSIONS.SAFETY_MANAGE),
    };
  });

  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/safety/new">
                <Plus aria-hidden />
                {t('newRecord')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ul className="grid gap-2 sm:grid-cols-2" aria-label={t('summary.open')}>
        <li>
          <Link
            href="/safety?status=open"
            className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3 text-sm"
          >
            <span>{t('summary.open')}</span>
            <span className="font-semibold tabular-nums" dir="ltr">
              {summary.openRecords}
            </span>
          </Link>
        </li>
        <li>
          <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3 text-sm">
            <span>{t('summary.overdue')}</span>
            <span className="font-semibold tabular-nums" dir="ltr">
              {summary.overdueActions}
            </span>
          </div>
        </li>
      </ul>

      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <section className="rounded-lg border border-[var(--pf-border-default)] p-3">
          <h2 className="font-medium">{t('summary.bySeverity')}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {SAFETY_SEVERITIES.map((key) => (
              <li key={key} className="flex justify-between gap-2">
                <span>{t(`severity.${key}`)}</span>
                <span className="tabular-nums" dir="ltr">
                  {summary.bySeverity[key]}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-[var(--pf-border-default)] p-3">
          <h2 className="font-medium">{t('summary.byType')}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {SAFETY_RECORD_TYPES.map((key) => (
              <li key={key} className="flex justify-between gap-2">
                <span>{t(`types.${key}`)}</span>
                <span className="tabular-nums" dir="ltr">
                  {summary.byType[key]}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-[var(--pf-border-default)] p-3">
          <h2 className="font-medium">{t('summary.byProject')}</h2>
          {summary.byProject.length === 0 ? (
            <p className="mt-2 text-[var(--pf-text-secondary)]">{t('empty')}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {summary.byProject.map((row) => (
                <li key={row.projectId} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{projectName.get(row.projectId) ?? row.projectId}</span>
                  <span className="tabular-nums" dir="ltr">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SafetyListFilters
        initialType={recordType ?? 'all'}
        initialStatus={status ?? 'all'}
        initialSeverity={severity ?? 'all'}
        projectId={projectId}
      />

      {records.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={t('empty')}
          description={t('emptyHint')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/safety/new">{t('newRecord')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={records}
          getRowKey={(record) => record.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.title')}</TableHead>
                    <TableHead>{t('list.columns.type')}</TableHead>
                    <TableHead>{t('list.columns.project')}</TableHead>
                    <TableHead>{t('list.columns.occurredAt')}</TableHead>
                    <TableHead>{t('list.columns.severity')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Link href={`/safety/${record.id}`} className={textNavLinkClassName}>
                          {record.title}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`types.${record.recordType}`)}</TableCell>
                      <TableCell>
                        {record.projectId ? (projectName.get(record.projectId) ?? '-') : '-'}
                      </TableCell>
                      <TableCell>
                        <span className="pf-ltr-island" dir="ltr">
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(record.occurredAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={safetySeverityShape(record.severity)}
                          label={t(`severity.${record.severity}`)}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={safetyRecordStatusShape(record.status)}
                          label={t(`status.${record.status}`)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(record) => (
            <Link href={`/safety/${record.id}`} className={pressableCardLinkClassName}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-semibold">{record.title}</span>
                <StatusBadge
                  shape={safetyRecordStatusShape(record.status)}
                  label={t(`status.${record.status}`)}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {t(`types.${record.recordType}`)}
                {record.projectId ? ` · ${projectName.get(record.projectId) ?? ''}` : ''}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
