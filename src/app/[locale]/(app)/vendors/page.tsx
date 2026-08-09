import { Plus, Truck } from 'lucide-react';

import type { Metadata } from 'next';

import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';

import { EmptyState } from '@/components/ui/empty-state';

import { PageHeader } from '@/components/ui/page-header';

import { StatusBadge } from '@/components/ui/status-badge';

import { ResponsiveTable } from '@/components/patterns/responsive-table';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { listVendorsForOrg } from '@/modules/vendors';

import { withOrgContext } from '@/shared/auth/session';

import { Link } from '@/shared/i18n/navigation';

import { hasPermission } from '@/shared/permissions/assert';

import { PERMISSIONS } from '@/shared/permissions/catalog';

import { VendorListFilters } from './vendor-list-filters';



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

  searchParams: Promise<{ q?: string }>;

}) {

  const t = await getTranslations('vendors');

  const tStatus = await getTranslations('status.generic');

  const tCommon = await getTranslations('common');

  const { q } = await searchParams;

  const filtersActive = Boolean(q?.trim());



  const { vendors, canManage } = await withOrgContext(async (context) => ({

    vendors: await listVendorsForOrg(context, { search: q }),

    canManage: hasPermission(context, PERMISSIONS.VENDORS_MANAGE),

  }));



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



      <VendorListFilters initialQuery={q ?? ''} />



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
                    <TableHead numeric>{t('list.columns.projects')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <Link href={`/vendors/${vendor.id}`} className="font-medium hover:underline">
                          {vendor.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`types.${vendor.type}`)}</TableCell>
                      <TableCell numeric>{vendor.projectCount}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={vendor.status === 'active' ? 'active' : 'archived'}
                          label={tStatus(vendor.status)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(vendor) => (
            <Link
              href={`/vendors/${vendor.id}`}
              className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{vendor.name}</span>
                <StatusBadge
                  shape={vendor.status === 'active' ? 'active' : 'archived'}
                  label={tStatus(vendor.status)}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {t(`types.${vendor.type}`)} · {t('list.projectsCount', { count: vendor.projectCount })}
              </p>
            </Link>
          )}
        />

      )}

    </div>

  );

}


