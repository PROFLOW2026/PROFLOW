import { ClipboardCheck, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  INSPECTION_STATUSES,
  listInspectionsForOrg,
  type InspectionStatus,
} from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { InspectionListFilters } from '../field-ops-list-filters';
import { FieldOpsSectionNav } from '../field-ops-section-nav';
import { InspectionStatusForm } from './inspection-status-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('nav.inspections') };
}

function inspectionShape(status: InspectionStatus): StatusShape {
  switch (status) {
    case 'scheduled':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'passed':
      return 'completed';
    case 'failed':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

function parseStatus(value?: string): InspectionStatus | undefined {
  if (!value || value === 'all') return undefined;
  return (INSPECTION_STATUSES as readonly string[]).includes(value)
    ? (value as InspectionStatus)
    : undefined;
}

export default async function FieldOpsInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: string }>;
}) {
  const t = await getTranslations('fieldOps');
  const tStatus = await getTranslations('status.inspection');
  const { projectId, status: statusParam } = await searchParams;
  const status = parseStatus(statusParam);

  const { items, projects, canManage } = await withOrgContext(async (context) => ({
    items: await listInspectionsForOrg(context, { projectId, status }),
    projects: await listProjectsForOrg(context, {}),
    canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
  }));

  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.inspections')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link
                href={
                  projectId
                    ? `/field-ops/inspections/new?projectId=${projectId}`
                    : '/field-ops/inspections/new'
                }
              >
                <Plus aria-hidden />
                {t('newInspection')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FieldOpsSectionNav active="inspections" />
      <InspectionListFilters projectId={projectId} initialStatus={statusParam ?? 'all'} />

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t('empty.inspections.title')}
          description={t('empty.inspections.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/field-ops/inspections/new">{t('empty.inspections.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={items}
          getRowKey={(item) => item.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.title')}</TableHead>
                    <TableHead>{t('list.columns.project')}</TableHead>
                    <TableHead>{t('list.columns.kind')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead>{t('list.columns.result')}</TableHead>
                    <TableHead>{t('list.columns.scheduledOn')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/field-ops/inspections/${item.id}`}
                          className="hover:underline"
                        >
                          {item.title}
                        </Link>
                      </TableCell>
                      <TableCell>{projectName.get(item.projectId) ?? '—'}</TableCell>
                      <TableCell>{t(`kinds.${item.kind}` as 'kinds.general')}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={inspectionShape(item.status)}
                          label={tStatus(item.status)}
                        />
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{item.result ?? '—'}</TableCell>
                      <TableCell>{item.scheduledOn ?? '—'}</TableCell>
                      {canManage ? (
                        <TableCell>
                          <InspectionStatusForm
                            inspectionId={item.id}
                            currentStatus={item.status}
                            currentResult={item.result}
                            compact
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(item) => (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/field-ops/inspections/${item.id}`}
                  className="font-semibold hover:underline"
                >
                  {item.title}
                </Link>
                <StatusBadge shape={inspectionShape(item.status)} label={tStatus(item.status)} />
              </div>
              <p className="text-sm text-[var(--pf-text-secondary)]">
                {projectName.get(item.projectId) ?? '—'} ·{' '}
                {t(`kinds.${item.kind}` as 'kinds.general')}
              </p>
              {item.result ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">{item.result}</p>
              ) : null}
              {canManage ? (
                <InspectionStatusForm
                  inspectionId={item.id}
                  currentStatus={item.status}
                  currentResult={item.result}
                  compact
                />
              ) : null}
            </div>
          )}
        />
      )}
    </div>
  );
}
