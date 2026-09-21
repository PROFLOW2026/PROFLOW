import { Plus, Truck } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { countVendorsForOrg, listVendorsForOrg } from '@/modules/vendors';
import { QueryPagination } from '@/components/ui/query-pagination';
import {
  ORG_LIST_PAGE_SIZE,
  orgListOffset,
  orgListPageCount,
  parseOrgListPage,
  resolveOrgListPage,
} from '@/shared/db/org-list-pagination';
import { listBusinessCatalog, localizeVendorCategoryOptions } from '@/modules/business-catalog';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';
import { VendorListFilters } from './vendor-list-filters';

export interface VendorsOrgListViewProps {
  readonly routeBase: string;
  readonly surface: OrgListSurface;
  readonly searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    categoryId?: string;
    page?: string;
  }>;
}

export async function VendorsOrgListView({
  routeBase,
  surface,
  searchParams,
}: VendorsOrgListViewProps) {
  const t = await getTranslations('vendors');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const params = await searchParams;
  const isOwner = surface === 'owner';
  const q = params.q;
  const type = params.type && params.type !== 'all' ? params.type : undefined;
  const status = params.status && params.status !== 'all' ? params.status : undefined;
  const categoryId =
    params.categoryId && params.categoryId !== 'all' ? params.categoryId : undefined;
  const filtersActive = Boolean(q?.trim() || type || status || categoryId);
  const requestedPage = parseOrgListPage(params.page);
  const listFilters = {
    search: q,
    type: type as 'supplier' | undefined,
    status: status as 'active' | undefined,
    categoryId,
  };

  const { vendors, canManage, canRead, categories, totalCount, currentPage, totalPages } =
    await withOrgContext(async (context) => {
      const allowed = orgListHasPermission(context, PERMISSIONS.VENDORS_READ, surface);
      if (!allowed) {
        return {
          vendors: [] as Awaited<ReturnType<typeof listVendorsForOrg>>,
          canManage: false,
          canRead: false,
          categories: [] as { id: string; name: string }[],
          totalCount: 0,
          currentPage: 1,
          totalPages: 0,
        };
      }

      const categoryRows = await listBusinessCatalog(context, 'vendor_category').catch(() => []);
      const total = await countVendorsForOrg(context, listFilters);
      const page = resolveOrgListPage(total, requestedPage);
      return {
        vendors: await listVendorsForOrg(context, {
          ...listFilters,
          limit: ORG_LIST_PAGE_SIZE,
          offset: orgListOffset(page),
        }),
        canManage: orgListHasPermission(context, PERMISSIONS.VENDORS_MANAGE, surface),
        canRead: true,
        categories: localizeVendorCategoryOptions(
          categoryRows.map((row) => ({
            id: row.id,
            key: row.key,
            name: row.name,
            isSystem: row.isSystem,
          })),
          locale,
        ),
        totalCount: total,
        currentPage: page,
        totalPages: orgListPageCount(total),
      };
    });

  if (!canRead) {
    const tEmployee =
      surface === 'employee' ? await getTranslations('employeeApp.vendors') : null;
    return (
      <div className="flex flex-col gap-6">
        {isOwner ? <PageHeader title={t('title')} description={t('description')} /> : null}
        <EmptyState
          icon={Truck}
          title={tEmployee?.('noAccess.title') ?? t('empty.title')}
          description={tEmployee?.('noAccess.description') ?? t('empty.body')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {isOwner ? (
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            canManage ? (
              <Button asChild>
                <Link href={`${routeBase}/new`}>
                  <Plus aria-hidden />
                  {t('newVendor')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : canManage ? (
        <Button asChild size="lg" block>
          <Link href={`${routeBase}/new`}>{t('newVendor')}</Link>
        </Button>
      ) : null}

      {isOwner ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.lifecycleHint')}</p>
      ) : null}

      <VendorListFilters
        initialQuery={q ?? ''}
        initialType={params.type ?? 'all'}
        initialStatus={params.status ?? 'all'}
        initialCategoryId={params.categoryId ?? ''}
        categories={categories.map((row) => ({ id: row.id, name: row.name }))}
      />
      {isOwner ? (
        <SavedListViewsBar
          listKey="vendors"
          searchParams={{
            q,
            type: params.type,
            status: params.status,
            categoryId: params.categoryId,
            page: params.page,
          }}
          keys={['q', 'type', 'status', 'categoryId', 'page']}
        />
      ) : null}

      {vendors.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title={tCommon('states.noResultsForQuery', { query: q?.trim() ?? '' })}
            description={tCommon('states.noResultsHint')}
            action={
              <Button asChild variant="secondary">
                <Link href={routeBase}>{tCommon('actions.clearSearch')}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Truck}
            title={t('empty.title')}
            description={t('empty.body')}
            action={
              canManage ? (
                <Button asChild>
                  <Link href={`${routeBase}/new`}>{t('empty.action')}</Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <ResponsiveTable
          items={vendors}
          getRowKey={(vendor) => vendor.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.type')}</TableHead>
                    <TableHead>{t('list.columns.category')}</TableHead>
                    <TableHead numeric>{t('list.columns.projects')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <Link
                          href={`${routeBase}/${vendor.id}`}
                          className={cn(textNavLinkClassName, 'font-medium')}
                        >
                          {vendor.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`types.${vendor.type}`)}</TableCell>
                      <TableCell>
                        {vendor.categoryNames.length > 0
                          ? vendor.categoryNames.join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell numeric>{vendor.projectCount}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={vendor.status === 'active' ? 'active' : 'archived'}
                          label={t(`list.status.${vendor.status}`)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(vendor) => (
            <Link href={`${routeBase}/${vendor.id}`} className={pressableCardLinkClassName}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-start font-semibold">
                  {vendor.name}
                </span>
                <StatusBadge
                  className="shrink-0"
                  shape={vendor.status === 'active' ? 'active' : 'archived'}
                  label={t(`list.status.${vendor.status}`)}
                />
              </div>
              <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">
                {t(`types.${vendor.type}`)}
                {vendor.categoryNames.length > 0
                  ? ` · ${vendor.categoryNames.join(', ')}`
                  : ''}{' '}
                · {t('list.projectsCount', { count: vendor.projectCount })}
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
          q,
          type: params.type,
          status: params.status,
          categoryId: params.categoryId,
        }}
        previousLabel={tCommon('actions.previous')}
        nextLabel={tCommon('actions.next')}
        pageOfLabel={tCommon('pagination.pageOf', { page: currentPage, pageCount: totalPages })}
        navLabel={tCommon('pagination.navLabel')}
      />
    </div>
  );
}
