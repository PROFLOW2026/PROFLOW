import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getMaterialById, listVendorPricesForMaterial } from '@/modules/procurement';
import { listVendorsForOrg } from '@/modules/vendors';
import { money } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { VendorPriceCreateForm } from './vendor-price-create-form';
import { VendorPriceDeleteButton } from './vendor-price-delete-button';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; materialId: string }>;
}): Promise<Metadata> {
  const { locale, materialId } = await params;
  const t = await getTranslations({ locale, namespace: 'procurement' });
  try {
    const material = await withOrgContext((context) => getMaterialById(context, materialId));
    return { title: material?.name ?? t('materialsTitle') };
  } catch {
    return { title: t('materialsTitle') };
  }
}

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ materialId: string }>;
}) {
  const { materialId } = await params;
  const t = await getTranslations('procurement');

  const loaded = await withOrgContext(async (context) => {
    const material = await getMaterialById(context, materialId);
    if (!material) return null;
    const canManage = hasPermission(context, PERMISSIONS.MATERIALS_MANAGE);
    const canReadVendors = hasPermission(context, PERMISSIONS.VENDORS_READ);
    const [prices, vendors] = await Promise.all([
      listVendorPricesForMaterial(context, materialId),
      canManage && canReadVendors
        ? listVendorsForOrg(context, { status: 'active' })
        : Promise.resolve([]),
    ]);
    return {
      material,
      prices,
      vendors: vendors.map((v) => ({ id: v.id, name: v.name })),
      canManage,
      defaultCurrency: context.organization.baseCurrency,
    };
  });

  if (!loaded) notFound();

  const { material, prices, vendors, canManage, defaultCurrency } = loaded;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={material.name}
        description={t('material.detailDescription')}
        breadcrumb={
          <Link
            href="/procurement/materials"
            className={textNavLinkMutedClassName}
          >
            {t('materialsTitle')}
          </Link>
        }
      />

      <dl className="grid min-w-0 gap-3 rounded-lg border border-[var(--pf-border-default)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.sku')}</dt>
          <dd className="break-words font-medium">
            {material.sku ? (
              <span dir="ltr" className="pf-numeric">
                {material.sku}
              </span>
            ) : (
              '-'
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.manufacturer')}</dt>
          <dd className="break-words font-medium">{material.manufacturer ?? '-'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.model')}</dt>
          <dd className="break-words font-medium">{material.model ?? '-'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.unit')}</dt>
          <dd className="font-medium">{material.unit}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.defaultPrice')}</dt>
          <dd className="font-medium">
            {material.defaultUnitPrice && material.currency ? (
              <MoneyText value={money(material.defaultUnitPrice, material.currency)} />
            ) : (
              '-'
            )}
          </dd>
        </div>
      </dl>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('vendorPrice.title')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('vendorPrice.description')}</p>

        {prices.length === 0 ? (
          <EmptyState title={t('vendorPrice.emptyTitle')} description={t('vendorPrice.emptyBody')} />
        ) : (
          <ResponsiveTable
            items={prices}
            getRowKey={(price) => price.id}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('vendorPrice.columns.vendor')}</TableHead>
                      <TableHead numeric>{t('vendorPrice.columns.unitPrice')}</TableHead>
                      <TableHead>{t('vendorPrice.columns.effectiveFrom')}</TableHead>
                      <TableHead>{t('vendorPrice.columns.notes')}</TableHead>
                      {canManage ? <TableHead>{t('list.columns.actions')}</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prices.map((price) => (
                      <TableRow key={price.id}>
                        <TableCell className="max-w-[12rem] truncate font-medium">
                          {price.vendorName}
                        </TableCell>
                        <TableCell numeric>
                          <MoneyText value={money(price.unitPrice, price.currency)} />
                        </TableCell>
                        <TableCell>
                          {price.effectiveFrom ? (
                            <span dir="ltr">{price.effectiveFrom}</span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate">{price.notes ?? '-'}</TableCell>
                        {canManage ? (
                          <TableCell>
                            <VendorPriceDeleteButton id={price.id} materialItemId={material.id} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(price) => (
              <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold">{price.vendorName}</p>
                  <MoneyText value={money(price.unitPrice, price.currency)} />
                </div>
                {price.effectiveFrom ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                    {price.effectiveFrom}
                  </p>
                ) : null}
                {price.notes ? (
                  <p className="break-words text-sm text-[var(--pf-text-secondary)]">{price.notes}</p>
                ) : null}
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <VendorPriceDeleteButton id={price.id} materialItemId={material.id} />
                  </div>
                ) : null}
              </div>
            )}
          />
        )}

        {canManage ? (
          <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="mb-3 text-sm font-semibold">{t('vendorPrice.createTitle')}</h3>
            {vendors.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('vendorPrice.needVendor')}</p>
            ) : (
              <VendorPriceCreateForm
                materialItemId={material.id}
                defaultCurrency={defaultCurrency}
                vendors={vendors}
              />
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
