import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import { listOrgContracts, listProjectsForOrg } from '@/modules/projects';
import { listClientsForOrg } from '@/modules/clients';
import { money } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';
import { ContractsListFilters } from './contracts-list-filters';

export interface ContractsOrgListViewProps {
  readonly routeBase: string;
  readonly surface: OrgListSurface;
  readonly searchParams: Promise<{
    status?: string;
    type?: string;
    clientId?: string;
    projectId?: string;
  }>;
}

function statusShape(status: string): StatusShape {
  switch (status) {
    case 'active':
      return 'active';
    case 'draft':
      return 'pending';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

function projectContractsHref(surface: OrgListSurface, projectId: string): string {
  if (surface === 'employee') {
    return `/employee/contracts?projectId=${encodeURIComponent(projectId)}`;
  }
  return `/projects/${projectId}?tab=contracts`;
}

export async function ContractsOrgListView({
  routeBase: _routeBase,
  surface,
  searchParams,
}: ContractsOrgListViewProps) {
  const t = await getTranslations('contracts');
  const params = await searchParams;

  const { items, clients, projects, canRead } = await withOrgContext(async (context) => {
    const allowed = orgListHasPermission(context, PERMISSIONS.CONTRACTS_READ, surface);
    if (!allowed) {
      return {
        items: [] as Awaited<ReturnType<typeof listOrgContracts>>,
        clients: [] as Awaited<ReturnType<typeof listClientsForOrg>>,
        projects: [] as Awaited<ReturnType<typeof listProjectsForOrg>>,
        canRead: false,
      };
    }

    return {
      items: await listOrgContracts(context, {
        status:
          params.status && params.status !== 'all'
            ? (params.status as 'draft' | 'active' | 'closed' | 'cancelled')
            : 'all',
        contractType:
          params.type && params.type !== 'all'
            ? (params.type as 'primary' | 'additional' | 'secondary')
            : 'all',
        clientId: params.clientId && params.clientId !== 'all' ? params.clientId : undefined,
        projectId: params.projectId && params.projectId !== 'all' ? params.projectId : undefined,
      }),
      clients: await listClientsForOrg(context, {}).catch(() => []),
      projects: await listProjectsForOrg(context, {}).catch(() => []),
      canRead: true,
    };
  });

  if (!canRead) {
    const tEmployee =
      surface === 'employee' ? await getTranslations('employeeApp.contracts') : null;
    return (
      <div className="flex flex-col gap-6">
        {surface === 'owner' ? (
          <PageHeader title={t('title')} description={t('description')} />
        ) : null}
        <EmptyState
          icon={FileText}
          title={tEmployee?.('noAccess.title') ?? t('empty.title')}
          description={tEmployee?.('noAccess.description') ?? t('empty.body')}
        />
      </div>
    );
  }

  return (
    <WithAppClientMessages extra={['contracts']}>
      <div className="flex flex-col gap-6">
        {surface === 'owner' ? (
          <PageHeader title={t('title')} description={t('description')} />
        ) : null}

        <ContractsListFilters
          initialStatus={params.status ?? 'all'}
          initialType={params.type ?? 'all'}
          initialClientId={params.clientId ?? ''}
          initialProjectId={params.projectId ?? ''}
          selectedClientName={
            items.find((item) => item.clientId && item.clientId === params.clientId)?.clientName ??
            null
          }
          selectedProjectName={
            items.find((item) => item.projectId === params.projectId)?.projectName ?? null
          }
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
          projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        />

        {items.length === 0 ? (
          <EmptyState icon={FileText} title={t('empty.title')} description={t('empty.body')} />
        ) : (
          <ResponsiveTable
            items={items}
            getRowKey={(item) => item.id}
            desktop={
              <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('list.columns.client')}</TableHead>
                      <TableHead>{t('list.columns.project')}</TableHead>
                      <TableHead>{t('list.columns.type')}</TableHead>
                      <TableHead>{t('list.columns.status')}</TableHead>
                      <TableHead>{t('list.columns.number')}</TableHead>
                      <TableHead>{t('list.columns.original')}</TableHead>
                      <TableHead>{t('list.columns.current')}</TableHead>
                      <TableHead>{t('list.columns.dates')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const href = projectContractsHref(surface, item.projectId);
                      return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link href={href} className="block text-inherit">
                            {item.clientName ?? '—'}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={href} className={cn(textNavLinkClassName, 'block font-medium')}>
                            {item.projectName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={href} className="block text-inherit">
                            {t(`types.${item.contractType}`)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={href} className="block">
                            <StatusBadge
                              shape={statusShape(item.status)}
                              label={t(`statuses.${item.status}`)}
                            />
                          </Link>
                        </TableCell>
                        <TableCell dir="ltr">
                          <Link href={href} className="block text-inherit">
                            {item.contractNumber || item.name || '—'}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={href} className="block text-inherit">
                            {item.originalAmount ? (
                              <MoneyText value={money(item.originalAmount, item.currency)} />
                            ) : (
                              '—'
                            )}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={href} className="block text-inherit">
                            {item.currentAmount ? (
                              <MoneyText value={money(item.currentAmount, item.currency)} />
                            ) : (
                              '—'
                            )}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={href} className="block text-inherit">
                            <span className="pf-ltr-island" dir="ltr">
                              {[item.startDate, item.endDate].filter(Boolean).join(' → ') || '—'}
                            </span>
                          </Link>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(item) => (
              <Link
                href={projectContractsHref(surface, item.projectId)}
                className={pressableCardLinkClassName}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {item.contractNumber || item.name || item.projectName}
                  </span>
                  <StatusBadge
                    className="shrink-0"
                    shape={statusShape(item.status)}
                    label={t(`statuses.${item.status}`)}
                  />
                </div>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                  {item.clientName ?? '—'} · {item.projectName}
                </p>
              </Link>
            )}
          />
        )}
      </div>
    </WithAppClientMessages>
  );
}
