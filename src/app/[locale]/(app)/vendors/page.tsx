import { Plus, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listVendorsForOrg } from '@/modules/vendors';
import { listBusinessCatalog, localizeVendorCategoryOptions } from '@/modules/business-catalog';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { VendorListFilters } from './vendor-list-filters';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'vendors' });
  return { title: t('title') };
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    categoryId?: string;
  }>;
}) {
  const t = await getTranslations('vendors');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const params = await searchParams;
  const q = params.q;
  const type = params.type && params.type !== 'all' ? params.type : undefined;
  const status = params.status && params.status !== 'all' ? params.status : undefined;
  const categoryId =
    params.categoryId && params.categoryId !== 'all' ? params.categoryId : undefined;
  const filtersActive = Boolean(q?.trim() || type || status || categoryId);

  const { vendors, canManage, categories } = await withOrgContext(async (context) => {
    const categoryRows = await listBusinessCatalog(context, 'vendor_category').catch(() => []);
    return {
      vendors: await listVendorsForOrg(context, {
        search: q,
        type: type as 'supplier' | undefined,
        status: status as 'active' | undefined,
        categoryId,
      }),
      canManage: hasPermission(context, PERMISSIONS.VENDORS_MANAGE),
      categories: localizeVendorCategoryOptions(
        categoryRows.map((row) => ({
          id: row.id,
          key: row.key,
          name: row.name,
          isSystem: row.isSystem,
        })),
        locale,
      ),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/vendors/new">
                <Plus aria-hidden />
                {t('newVendor')}
              </Link>
            </Button>
          ) : null
        }
      />

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.lifecycleHint')}</p>

      <VendorListFilters
        initialQuery={q ?? ''}
        initialType={params.type ?? 'all'}
        initialStatus={params.status ?? 'all'}
        initialCategoryId={params.categoryId ?? ''}
        categories={categories.map((row) => ({ id: row.id, name: row.name }))}
      />
      <SavedListViewsBar
        listKey="vendors"
        searchParams={{
          q,
          type: params.type,
          status: params.status,
          categoryId: params.categoryId,
        }}
        keys={['q', 'type', 'status', 'categoryId']}
      />

      {vendors.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title={tCommon('states.noResultsForQuery', { query: q?.trim() ?? '' })}
            description={tCommon('states.noResultsHint')}
            action={
              <Button asChild variant="secondary">
                <Link href="/vendors">{tCommon('actions.clearSearch')}</Link>
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
                  <Link href="/vendors/new">{t('empty.action')}</Link>
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
                          href={`/vendors/${vendor.id}`}
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
            <Link href={`/vendors/${vendor.id}`} className={pressableCardLinkClassName}>
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
    </div>
  );
}
