import { ListChecks, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listPunchListItemsForOrg, type PunchStatus } from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { FieldOpsSectionNav } from '../field-ops-section-nav';
import { PunchStatusForm } from './punch-status-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('nav.punch') };
}

function punchShape(status: PunchStatus): StatusShape {
  switch (status) {
    case 'open':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'done':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function FieldOpsPunchPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations('fieldOps');
  const tStatus = await getTranslations('status.punch');
  const { projectId } = await searchParams;

  const { items, projects, canManage } = await withOrgContext(async (context) => ({
    items: await listPunchListItemsForOrg(context, projectId),
    projects: await listProjectsForOrg(context, {}),
    canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
  }));

  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.punch')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href={projectId ? `/field-ops/punch/new?projectId=${projectId}` : '/field-ops/punch/new'}>
                <Plus aria-hidden />
                {t('newPunch')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FieldOpsSectionNav active="punch" />

      {items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={t('empty.punch.title')}
          description={t('empty.punch.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/field-ops/punch/new">{t('empty.punch.action')}</Link>
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
                    <TableHead>{t('list.columns.priority')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead>{t('list.columns.dueDate')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>{projectName.get(item.projectId) ?? '—'}</TableCell>
                      <TableCell>{t(`priorities.${item.priority}`)}</TableCell>
                      <TableCell>
                        <StatusBadge shape={punchShape(item.status)} label={tStatus(item.status)} />
                      </TableCell>
                      <TableCell>{item.dueDate ?? '—'}</TableCell>
                      {canManage ? (
                        <TableCell>
                          <PunchStatusForm punchListItemId={item.id} currentStatus={item.status} />
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
                <StatusBadge shape={punchShape(item.status)} label={tStatus(item.status)} />
              </div>
              <p className="text-sm text-[var(--pf-text-secondary)]">
                {projectName.get(item.projectId) ?? '—'} · {t(`priorities.${item.priority}`)}
              </p>
              {canManage ? (
                <PunchStatusForm punchListItemId={item.id} currentStatus={item.status} />
              ) : null}
            </div>
          )}
        />
      )}
    </div>
  );
}
