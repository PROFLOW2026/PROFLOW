import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listWorkOrdersForOrg, type ServiceStatus } from '@/modules/service';
import { titleWithDocumentNumber } from '@/modules/tenancy';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { WorkOrderStatusBadge } from '@/modules/service/ui/work-order-status-badge';
import { WorkOrderListFilters } from './work-order-list-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'service' });
  return { title: t('title') };
}

interface WorkOrdersPageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

function isServiceStatus(value: string | undefined): value is ServiceStatus {
  return (
    value === 'new' ||
    value === 'scheduled' ||
    value === 'in_progress' ||
    value === 'waiting' ||
    value === 'completed' ||
    value === 'cancelled'
  );
}

export default async function WorkOrdersPage({ searchParams }: WorkOrdersPageProps) {
  const [t, tCommon, params, shell] = await Promise.all([
    getTranslations('service'),
    getTranslations('common'),
    searchParams,
    getShellContext(),
  ]);

  const serviceStatus = isServiceStatus(params.status) ? params.status : undefined;
  const canManage = shell?.permissions.has(PERMISSIONS.SERVICE_MANAGE) ?? false;
  const filtersActive = Boolean(params.q?.trim() || serviceStatus);

  const workOrders = await withOrgContext((context) =>
    listWorkOrdersForOrg(context, {
      search: params.q,
      serviceStatus,
    }),
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6" data-pf-work-orders-list="">
      <PageHeader
        title={t('title')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/work-orders/new">
                <Plus aria-hidden />
                {t('newWorkOrder')}
              </Link>
            </Button>
          ) : null
        }
      />

      <WorkOrderListFilters initialQuery={params.q ?? ''} initialStatus={serviceStatus ?? 'all'} />
      <SavedListViewsBar
        listKey="work_orders"
        searchParams={{ q: params.q, status: params.status }}
        keys={['q', 'status']}
      />

      {workOrders.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title={tCommon('states.noResultsForQuery', {
              query: params.q?.trim() || (serviceStatus ? t(`status.${serviceStatus}`) : ''),
            })}
            description={tCommon('states.noResultsHint')}
            action={
              <Button asChild variant="secondary">
                <Link href="/work-orders">{tCommon('actions.clearSearch')}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('empty.title')}
            description={t('empty.body')}
            action={
              canManage ? (
                <Button asChild>
                  <Link href="/work-orders/new">{t('empty.action')}</Link>
                </Button>
              ) : undefined
            }
            secondaryAction={
              <Button asChild variant="ghost">
                <Link href="/settings/features">{t('empty.moduleLink')}</Link>
              </Button>
            }
          />
        )
      ) : (
        <ResponsiveTable
          items={workOrders}
          getRowKey={(row) => row.id}
          desktop={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('list.columns.customer')}</TableHead>
                  <TableHead>{t('list.columns.name')}</TableHead>
                  <TableHead>{t('list.columns.site')}</TableHead>
                  <TableHead>{t('list.columns.window')}</TableHead>
                  <TableHead>{t('list.columns.assignee')}</TableHead>
                  <TableHead>{t('list.columns.status')}</TableHead>
                  <TableHead>{t('list.columns.priority')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.clientName ?? '-'}</TableCell>
                    <TableCell>
                      <Link
                        href={`/work-orders/${row.id}`}
                        className={cn(textNavLinkClassName, 'font-medium')}
                      >
                        {titleWithDocumentNumber(row.name, row.documentNumber ?? '')}
                      </Link>
                    </TableCell>
                    <TableCell>{row.service?.siteAddress ?? row.location ?? '-'}</TableCell>
                    <TableCell className="pf-ltr-island" dir="ltr">
                      {row.service?.scheduledStartAt
                        ? row.service.scheduledStartAt.toISOString().slice(0, 16).replace('T', ' ')
                        : '-'}
                    </TableCell>
                    <TableCell>{row.assigneeName ?? '-'}</TableCell>
                    <TableCell>
                      {row.service ? (
                        <WorkOrderStatusBadge
                          status={row.service.serviceStatus}
                          label={t(`status.${row.service.serviceStatus}`)}
                        />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {row.service ? t(`priority.${row.service.priority}`) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
          renderMobileCard={(row) => (
            <Link
              href={`/work-orders/${row.id}`}
              className={cn(pressableCardLinkClassName, 'min-w-0 max-w-full')}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 flex-1 break-words font-semibold">
                  {titleWithDocumentNumber(row.name, row.documentNumber ?? '')}
                </span>
                {row.service ? (
                  <WorkOrderStatusBadge
                    status={row.service.serviceStatus}
                    label={t(`status.${row.service.serviceStatus}`)}
                  />
                ) : null}
              </div>
              <p className="mt-1 min-w-0 break-words text-sm text-[var(--pf-text-secondary)]">
                {row.clientName ?? '-'}
                {row.service?.siteAddress ? ` · ${row.service.siteAddress}` : ''}
              </p>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {row.assigneeName ?? t('list.unassigned')}
                {row.service?.scheduledStartAt
                  ? ` · ${row.service.scheduledStartAt.toISOString().slice(0, 16).replace('T', ' ')}`
                  : ''}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
