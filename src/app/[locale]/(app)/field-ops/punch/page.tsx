import { ListChecks, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  PUNCH_PRIORITIES,
  PUNCH_STATUSES,
  listPunchListItemsForOrg,
  type PunchPriority,
  type PunchStatus,
} from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { PunchListFilters } from '../field-ops-list-filters';
import { FieldOpsSectionNav } from '../field-ops-section-nav';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { PunchPriorityForm } from './punch-priority-form';
import { PunchStatusForm } from './punch-status-form';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

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

function parseStatus(value?: string): PunchStatus | undefined {
  if (!value || value === 'all') return undefined;
  return (PUNCH_STATUSES as readonly string[]).includes(value)
    ? (value as PunchStatus)
    : undefined;
}

function parsePriority(value?: string): PunchPriority | undefined {
  if (!value || value === 'all') return undefined;
  return (PUNCH_PRIORITIES as readonly string[]).includes(value)
    ? (value as PunchPriority)
    : undefined;
}

export default async function FieldOpsPunchPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: string; priority?: string }>;
}) {
  const t = await getTranslations('fieldOps');
  const tStatus = await getTranslations('status.punch');
  const { projectId, status: statusParam, priority: priorityParam } = await searchParams;
  const status = parseStatus(statusParam);
  const priority = parsePriority(priorityParam);

  const { items, projects, canManage } = await withOrgContext(async (context) => {
    const [punchItems, projectRows] = await Promise.all([
      listPunchListItemsForOrg(context, { projectId, status, priority }),
      listProjectsForOrg(context, {}),
    ]);
    return {
      items: punchItems,
      projects: projectRows,
      canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
    };
  });

  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.punch')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link
                href={
                  projectId ? `/field-ops/punch/new?projectId=${projectId}` : '/field-ops/punch/new'
                }
              >
                <Plus aria-hidden />
                {t('newPunch')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FieldOpsSectionNav active="punch" />
      <PunchListFilters
        projectId={projectId}
        initialStatus={statusParam ?? 'all'}
        initialPriority={priorityParam ?? 'all'}
      />
      <SavedListViewsBar
        listKey="punch"
        searchParams={{ projectId, status: statusParam, priority: priorityParam }}
        keys={['projectId', 'status', 'priority']}
      />

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
                      <TableCell className="font-medium">
                        <Link href={`/field-ops/punch/${item.id}`} className={textNavLinkClassName}>
                          {item.title}
                        </Link>
                      </TableCell>
                      <TableCell>{projectName.get(item.projectId) ?? '—'}</TableCell>
                      <TableCell>
                        {canManage ? (
                          <PunchPriorityForm
                            punchListItemId={item.id}
                            currentPriority={item.priority}
                          />
                        ) : (
                          t(`priorities.${item.priority}`)
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge shape={punchShape(item.status)} label={tStatus(item.status)} />
                      </TableCell>
                      <TableCell>
                        {item.dueDate ? (
                          <span className="pf-ltr-island" dir="ltr">
                            {item.dueDate}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
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
            <div className="flex min-h-11 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/field-ops/punch/${item.id}`}
                  className={cn(textNavLinkClassName, 'min-w-0 flex-1 font-semibold')}
                >
                  {item.title}
                </Link>
                <StatusBadge shape={punchShape(item.status)} label={tStatus(item.status)} />
              </div>
              <p className="text-sm text-[var(--pf-text-secondary)]">
                {projectName.get(item.projectId) ?? '—'} · {t(`priorities.${item.priority}`)}
                {item.dueDate ? (
                  <>
                    {' · '}
                    <span className="pf-ltr-island" dir="ltr">
                      {item.dueDate}
                    </span>
                  </>
                ) : null}
              </p>
              {canManage ? (
                <div className="flex flex-col gap-2">
                  <PunchPriorityForm punchListItemId={item.id} currentPriority={item.priority} />
                  <PunchStatusForm punchListItemId={item.id} currentStatus={item.status} />
                </div>
              ) : null}
            </div>
          )}
        />
      )}
    </div>
  );
}
