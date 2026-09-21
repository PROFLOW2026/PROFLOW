import { Plus, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { countClientsForOrg, listClientsForOrg } from '@/modules/clients';
import { QueryPagination } from '@/components/ui/query-pagination';
import {
  ORG_LIST_PAGE_SIZE,
  orgListOffset,
  orgListPageCount,
  parseOrgListPage,
  resolveOrgListPage,
} from '@/shared/db/org-list-pagination';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { ClientListFilters } from './client-list-filters';

export interface ClientsOrgListSearchParams {
  q?: string;
  includeArchived?: string;
  clientTypeId?: string;
  page?: string;
}

interface ClientsOrgListViewProps {
  routeBase: string;
  surface?: 'owner' | 'employee';
  showSavedViews?: boolean;
  searchParams: ClientsOrgListSearchParams;
}

export async function ClientsOrgListView({
  routeBase,
  surface = 'owner',
  showSavedViews,
  searchParams: params,
}: ClientsOrgListViewProps) {
  const resolvedShowSavedViews = showSavedViews ?? surface === 'owner';

  const [t, tStatus, tCommon, shell] = await Promise.all([
    getTranslations('clients'),
    getTranslations('status.generic'),
    getTranslations('common'),
    surface === 'owner' ? getShellContext() : Promise.resolve(null),
  ]);

  const includeArchived = params.includeArchived === '1';
  const clientTypeId =
    params.clientTypeId && params.clientTypeId !== 'all' ? params.clientTypeId : undefined;
  const requestedPage = parseOrgListPage(params.page);
  const listFilters = {
    search: params.q,
    includeArchived,
    clientTypeId,
  };

  const { clients, clientTypes, totalCount, currentPage, totalPages, canManage, canRead } =
    await withOrgContext(async (context) => {
      if (surface === 'employee' && !employeeHasPermission(context, PERMISSIONS.CLIENTS_READ)) {
        return {
          clients: [],
          clientTypes: [],
          totalCount: 0,
          currentPage: 1,
          totalPages: 0,
          canManage: false,
          canRead: false,
        };
      }

      const { listBusinessCatalog } = await import('@/modules/business-catalog');
      const total = await countClientsForOrg(context, listFilters);
      const page = resolveOrgListPage(total, requestedPage);
      const canManageClients =
        surface === 'employee'
          ? employeeHasPermission(context, PERMISSIONS.CLIENTS_MANAGE)
          : (shell?.permissions.has(PERMISSIONS.CLIENTS_MANAGE) ?? false);

      return {
        clients: await listClientsForOrg(context, {
          ...listFilters,
          limit: ORG_LIST_PAGE_SIZE,
          offset: orgListOffset(page),
        }),
        clientTypes: await listBusinessCatalog(context, 'client_type').catch(() => []),
        totalCount: total,
        currentPage: page,
        totalPages: orgListPageCount(total),
        canManage: canManageClients,
        canRead: true,
      };
    });

  if (!canRead) {
    const tEmployee = await getTranslations('employeeApp.clients');
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Users}
          title={tEmployee('noAccess.title')}
          description={tEmployee('noAccess.description')}
        />
      </div>
    );
  }

  const newClientHref = `${routeBase}/new`;
  const clientDetailHref = (clientId: string) => `${routeBase}/${clientId}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href={newClientHref}>
                <Plus aria-hidden />
                {t('newClient')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ClientListFilters
        initialQuery={params.q ?? ''}
        includeArchived={includeArchived}
        initialClientTypeId={params.clientTypeId ?? ''}
        clientTypes={clientTypes.map((row) => ({ id: row.id, name: row.name }))}
      />

      {resolvedShowSavedViews ? (
        <SavedListViewsBar
          listKey="clients"
          searchParams={{
            q: params.q,
            includeArchived: params.includeArchived,
            clientTypeId: params.clientTypeId,
            page: params.page,
          }}
          keys={['q', 'includeArchived', 'clientTypeId', 'page']}
        />
      ) : null}

      {clients.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href={newClientHref}>{t('empty.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={clients}
          getRowKey={(client) => client.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.type')}</TableHead>
                    <TableHead numeric>{t('list.columns.projects')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          href={clientDetailHref(client.id)}
                          className={cn(textNavLinkClassName, 'rounded-sm font-medium')}
                        >
                          {client.name}
                        </Link>
                      </TableCell>
                      <TableCell>{client.clientTypeName ?? '—'}</TableCell>
                      <TableCell numeric>
                        <span dir="ltr">{client.projectCount}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={
                            client.archivedAt || client.status === 'inactive' ? 'archived' : 'active'
                          }
                          label={
                            client.archivedAt
                              ? t('detail.archivedBadge')
                              : tStatus(client.status)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(client) => (
            <Link
              href={clientDetailHref(client.id)}
              className={cn(pressableCardLinkClassName, 'text-start')}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-start font-semibold">{client.name}</span>
                <StatusBadge
                  className="shrink-0"
                  shape={
                    client.archivedAt || client.status === 'inactive' ? 'archived' : 'active'
                  }
                  label={
                    client.archivedAt ? t('detail.archivedBadge') : tStatus(client.status)
                  }
                />
              </div>
              <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">
                {t('list.columns.projects')}: <span dir="ltr">{client.projectCount}</span>
              </p>
            </Link>
          )}
        />
      )}

      <QueryPagination
        basePath={routeBase}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={ORG_LIST_PAGE_SIZE}
        currentParams={{
          q: params.q,
          includeArchived: params.includeArchived,
          clientTypeId: params.clientTypeId,
        }}
        previousLabel={tCommon('actions.previous')}
        nextLabel={tCommon('actions.next')}
        pageOfLabel={tCommon('pagination.pageOf', { page: currentPage, pageCount: totalPages })}
        navLabel={tCommon('pagination.navLabel')}
      />
    </div>
  );
}
