import { LegacyListTableShell, MainAppPage, MainAppSection, MainAppTableShell } from '@/components/patterns/main-app';
import { Plus, Truck } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { countVendorsForOrg, listVendorsForOrg } from '@/modules/vendors';
import { mapVendorLogoKeys, resolveIdentityImageUrls } from '@/modules/identity-images';
import { IdentityAvatar } from '@/modules/identity-images/client';
import { QueryPagination } from '@/components/ui/query-pagination';
import { LtrIsland } from '@/shared/i18n/ltr-island';
import {
  ORG_LIST_PAGE_SIZE,
  orgListOffset,
  orgListPageCount,
  parseOrgListPage,
  resolveOrgListPage,
} from '@/shared/db/org-list-pagination';
import {
  VENDOR_LIST_DEFAULT_PAGE_SIZE,
  parseVendorListPageSize,
  resolveVendorListPage,
  vendorListOffset,
  vendorListPageCount,
} from '@/modules/vendors/domain/vendor-list-pagination';
import { VendorsListPagination } from './vendors-list-pagination';
import { listBusinessCatalog, localizeVendorCategoryOptions } from '@/modules/business-catalog';
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
    pageSize?: string;
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
  const ownerPageSize = parseVendorListPageSize(params.pageSize);
  const requestedPage = isOwner
    ? parseOrgListPage(params.page)
    : parseOrgListPage(params.page);
  const listFilters = {
    search: q,
    type: type as 'supplier' | undefined,
    status: status as 'active' | undefined,
    categoryId,
  };

  const { vendors, canManage, canRead, categories, totalCount, currentPage, totalPages, pageSize: resolvedPageSize } =
    await withOrgContext(async (context) => {
      const allowed = orgListHasPermission(context, PERMISSIONS.VENDORS_READ, surface);
      if (!allowed) {
        return {
          vendors: [] as Array<Awaited<ReturnType<typeof listVendorsForOrg>>[number] & { logoUrl: string | null }>,
          canManage: false,
          canRead: false,
          categories: [] as { id: string; name: string }[],
          totalCount: 0,
          currentPage: 1,
          totalPages: 0,
          pageSize: isOwner ? ownerPageSize : ORG_LIST_PAGE_SIZE,
        };
      }

      const categoryRows = await listBusinessCatalog(context, 'vendor_category').catch(() => []);
      const total = await countVendorsForOrg(context, listFilters);
      const pageSize = isOwner ? ownerPageSize : ORG_LIST_PAGE_SIZE;
      const page = isOwner
        ? resolveVendorListPage(total, requestedPage, pageSize)
        : resolveOrgListPage(total, requestedPage);
      const vendorRows = await listVendorsForOrg(context, {
        ...listFilters,
        limit: pageSize,
        offset: isOwner ? vendorListOffset(page, pageSize) : orgListOffset(page),
      });
      const logoKeys = await mapVendorLogoKeys(
        context.db,
        context.organizationId,
        vendorRows.map((row) => row.id),
      );
      const logoUrls = await resolveIdentityImageUrls(logoKeys);
      return {
        vendors: vendorRows.map((row) => ({
          ...row,
          logoUrl: logoUrls.get(row.id) ?? null,
        })),
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
        totalPages: isOwner ? vendorListPageCount(total, ownerPageSize) : orgListPageCount(total),
        pageSize: isOwner ? ownerPageSize : ORG_LIST_PAGE_SIZE,
      };
    });

  const pageSize = resolvedPageSize ?? (isOwner ? ownerPageSize : ORG_LIST_PAGE_SIZE);

  if (!canRead) {
    const tEmployee =
      surface === 'employee' ? await getTranslations('employeeApp.vendors') : null;
    return (
      <MainAppPage>
        {isOwner ? <PageHeader title={t('title')} description={t('description')} /> : null}
        <MainAppSection>
        <EmptyState
          icon={Truck}
          title={tEmployee?.('noAccess.title') ?? t('empty.title')}
          description={tEmployee?.('noAccess.description') ?? t('empty.body')}
        />
        </MainAppSection>
      </MainAppPage>
    );
  }

  return (
    <MainAppPage {...(isOwner ? { 'data-pf-vendors-list-owner': '' } : {})}>
      {isOwner ? (
        <PageHeader
          title={t('title')}
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

      <MainAppSection>
      {!isOwner ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.lifecycleHint')}</p>
      ) : null}

      <VendorListFilters
        routeBase={isOwner ? routeBase : undefined}
        layout={isOwner ? 'ownerList' : 'default'}
        initialQuery={q ?? ''}
        initialType={params.type ?? 'all'}
        initialStatus={params.status ?? 'all'}
        initialCategoryId={params.categoryId ?? ''}
        categories={categories.map((row) => ({ id: row.id, name: row.name }))}
      />

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
            isOwner ? (
            <MainAppTableShell className="pf-vendors-table-shell">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={isOwner ? 'pf-vendors-col-name' : undefined}>
                      {t('list.columns.name')}
                    </TableHead>
                    <TableHead className={isOwner ? 'pf-vendors-col-type' : undefined}>
                      {t('list.columns.type')}
                    </TableHead>
                    <TableHead className={isOwner ? 'pf-vendors-col-category' : undefined}>
                      {t('list.columns.category')}
                    </TableHead>
                    {isOwner ? (
                      <>
                        <TableHead className="pf-vendors-col-id">
                          {t('list.columns.companyId')}
                        </TableHead>
                        <TableHead className="pf-vendors-col-contact">
                          {t('list.columns.contact')}
                        </TableHead>
                        <TableHead className="pf-vendors-col-phone">{t('create.phoneLabel')}</TableHead>
                      </>
                    ) : null}
                    <TableHead
                      numeric={!isOwner}
                      className={isOwner ? 'pf-vendors-col-projects' : undefined}
                    >
                      {t('list.columns.projects')}
                    </TableHead>
                    <TableHead className={isOwner ? 'pf-vendors-col-status' : undefined}>
                      {t('list.columns.status')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className={isOwner ? 'pf-vendors-col-name pf-vendors-supplier-cell' : undefined}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <IdentityAvatar
                            previewUrl={vendor.logoUrl}
                            displayName={vendor.name}
                            size="sm"
                          />
                          <Link
                            href={`${routeBase}/${vendor.id}`}
                            className={cn(textNavLinkClassName, 'font-medium')}
                          >
                            {vendor.name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className={isOwner ? 'pf-vendors-col-type' : undefined}>
                        {t(`types.${vendor.type}`)}
                      </TableCell>
                      <TableCell className={isOwner ? 'pf-vendors-col-category' : undefined}>
                        {vendor.categoryNames.length > 0
                          ? vendor.categoryNames.join(', ')
                          : '—'}
                      </TableCell>
                      {isOwner ? (
                        <>
                          <TableCell className="pf-vendors-col-id">
                            <LtrIsland className="tabular-nums">
                              {vendor.registrationId ?? '—'}
                            </LtrIsland>
                          </TableCell>
                          <TableCell className="pf-vendors-col-contact">
                            {vendor.primaryContactName ?? '—'}
                          </TableCell>
                          <TableCell className="pf-vendors-col-phone">
                            <LtrIsland>{vendor.listPhone ?? '—'}</LtrIsland>
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell
                        numeric={!isOwner}
                        className={isOwner ? 'pf-vendors-col-projects' : undefined}
                      >
                        {vendor.projectCount}
                      </TableCell>
                      <TableCell className={isOwner ? 'pf-vendors-col-status' : undefined}>
                        <StatusBadge
                          shape={vendor.status === 'active' ? 'active' : 'archived'}
                          label={t(`list.status.${vendor.status}`)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </MainAppTableShell>
            ) : (
            <LegacyListTableShell>
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
                        <div className="flex min-w-0 items-center gap-2.5">
                          <IdentityAvatar
                            previewUrl={vendor.logoUrl}
                            displayName={vendor.name}
                            size="sm"
                          />
                          <Link
                            href={`${routeBase}/${vendor.id}`}
                            className={cn(textNavLinkClassName, 'font-medium')}
                          >
                            {vendor.name}
                          </Link>
                        </div>
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
            </LegacyListTableShell>
            )
          }
          mobileListClassName={isOwner ? 'pf-vendors-mobile-list flex flex-col' : undefined}
          renderMobileCard={(vendor) => (
            <Link
              href={`${routeBase}/${vendor.id}`}
              className={isOwner ? 'pf-vendors-mobile-row' : pressableCardLinkClassName}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2.5 text-start font-semibold">
                  <IdentityAvatar
                    previewUrl={vendor.logoUrl}
                    displayName={vendor.name}
                    size="sm"
                  />
                  <span className="min-w-0 truncate">{vendor.name}</span>
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

      {isOwner ? (
        <VendorsListPagination
          className="pf-vendors-list-pagination-wrap"
          basePath={routeBase}
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          defaultPageSize={VENDOR_LIST_DEFAULT_PAGE_SIZE}
          currentParams={{
            q,
            type: params.type,
            status: params.status,
            categoryId: params.categoryId,
            pageSize: params.pageSize,
          }}
          previousLabel={tCommon('actions.previous')}
          nextLabel={tCommon('actions.next')}
          pageOfLabel={tCommon('pagination.pageOf', { page: currentPage, pageCount: totalPages })}
          navLabel={tCommon('pagination.navLabel')}
          rowsPerPageLabel={tCommon('pagination.rowsPerPage')}
        />
      ) : (
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
      )}
      </MainAppSection>
    </MainAppPage>
  );
}
