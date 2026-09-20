import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
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
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { ClientListFilters } from './client-list-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('title') };
}

interface ClientsPageProps {
  searchParams: Promise<{
    q?: string;
    includeArchived?: string;
    clientTypeId?: string;
    page?: string;
  }>;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const [t, tStatus, tCommon, params, shell] = await Promise.all([
    getTranslations('clients'),
    getTranslations('status.generic'),
    getTranslations('common'),
    searchParams,
    getShellContext(),
  ]);
  const canManage = shell?.permissions.has(PERMISSIONS.CLIENTS_MANAGE) ?? false;
  const includeArchived = params.includeArchived === '1';
  const clientTypeId =
    params.clientTypeId && params.clientTypeId !== 'all' ? params.clientTypeId : undefined;
  const requestedPage = parseOrgListPage(params.page);
  const listFilters = {
    search: params.q,
    includeArchived,
    clientTypeId,
  };

  const { clients, clientTypes, totalCount, currentPage, totalPages } = await withOrgContext(
    async (context) => {
      const { listBusinessCatalog } = await import('@/modules/business-catalog');
      const total = await countClientsForOrg(context, listFilters);
      const page = resolveOrgListPage(total, requestedPage);
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
      };
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/clients/new">
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

      {clients.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/clients/new">{t('empty.action')}</Link>
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
                          href={`/clients/${client.id}`}
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
              href={`/clients/${client.id}`}
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
        basePath="/clients"
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
