import { ClipboardCheck, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listInspectionsForOrg, type InspectionStatus } from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
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

export default async function FieldOpsInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations('fieldOps');
  const tStatus = await getTranslations('status.inspection');
  const { projectId } = await searchParams;

  const { items, projects, canManage } = await withOrgContext(async (context) => ({
    items: await listInspectionsForOrg(context, projectId),
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
                    <TableHead>{t('list.columns.scheduledOn')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>{projectName.get(item.projectId) ?? '—'}</TableCell>
                      <TableCell>
                        {t(`kinds.${item.kind}` as 'kinds.general')}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={inspectionShape(item.status)}
                          label={tStatus(item.status)}
                        />
                      </TableCell>
                      <TableCell>{item.scheduledOn ?? '—'}</TableCell>
                      {canManage ? (
                        <TableCell>
                          <InspectionStatusForm
                            inspectionId={item.id}
                            currentStatus={item.status}
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
                <span className="font-semibold">{item.title}</span>
                <StatusBadge shape={inspectionShape(item.status)} label={tStatus(item.status)} />
              </div>
              <p className="text-sm text-[var(--pf-text-secondary)]">
                {projectName.get(item.projectId) ?? '—'} ·{' '}
                {t(`kinds.${item.kind}` as 'kinds.general')}
              </p>
              {canManage ? (
                <InspectionStatusForm inspectionId={item.id} currentStatus={item.status} />
              ) : null}
            </div>
          )}
        />
      )}
    </div>
  );
}
