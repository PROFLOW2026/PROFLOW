import { Package, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listInventoryItemsForOrg, listInventoryLocationsForOrg, type ReorderStatus } from '@/modules/assets';
import { listMaterialsForOrg } from '@/modules/procurement';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AssetsSectionNav } from '../assets-section-nav';
import { InventoryItemCreateForm } from './inventory-item-create-form';
import { InventoryLocationsPanel } from './inventory-locations-panel';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { Alert } from '@/components/ui/alert';

/**
 * UX: operational inventory under /assets/inventory.
 * Materials catalog + vendor prices under /procurement/materials.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  return { title: t('inventory.title') };
}

function reorderTone(status: ReorderStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'ok':
      return 'success';
    case 'at_reorder':
      return 'warning';
    case 'below_reorder':
      return 'danger';
    default:
      return 'neutral';
  }
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const t = await getTranslations('assets');
  const { new: showNew } = await searchParams;

  const { items, materials, locations, canManage } = await withOrgContext(async (context) => {
    const canReadMaterials = hasPermission(context, PERMISSIONS.MATERIALS_READ);
    return {
      items: await listInventoryItemsForOrg(context),
      locations: await listInventoryLocationsForOrg(context),
      materials: canReadMaterials
        ? (await listMaterialsForOrg(context)).map((m) => ({
            id: m.id,
            name: m.name,
            sku: m.sku,
          }))
        : [],
      canManage: hasPermission(context, PERMISSIONS.ASSETS_MANAGE),
    };
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('inventory.title')}
        description={t('inventory.description')}
        actions={
          canManage ? (
            <Button asChild className="max-w-full">
              <Link href="/assets/inventory?new=1">
                <Plus aria-hidden />
                {t('newInventoryItem')}
              </Link>
            </Button>
          ) : null
        }
      />
      <AssetsSectionNav active="inventory" />

      <Alert tone="info">
        <span className="block font-medium">{t('inventory.qtyOnlyBannerHe')}</span>
        <span className="block text-sm">{t('inventory.qtyOnlyBannerEn')}</span>
      </Alert>

      <InventoryLocationsPanel
        locations={locations}
        canManage={canManage}
      />

      {canManage && showNew === '1' ? (
        <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="mb-3 font-semibold">{t('inventory.createTitle')}</h2>
          <InventoryItemCreateForm materials={materials} />
        </div>
      ) : null}

      {items.length === 0 && showNew !== '1' ? (
        <EmptyState
          icon={Package}
          title={t('empty.inventory.title')}
          description={t('empty.inventory.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/assets/inventory?new=1">{t('empty.inventory.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : items.length > 0 ? (
        <ResponsiveTable
          items={items}
          getRowKey={(item) => item.id}
          desktop={
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.sku')}</TableHead>
                    <TableHead>{t('list.columns.unit')}</TableHead>
                    <TableHead numeric>{t('list.columns.quantity')}</TableHead>
                    <TableHead numeric>{t('list.columns.reorderLevel')}</TableHead>
                    <TableHead>{t('list.columns.reorderStatus')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[14rem] truncate font-medium">
                        <Link
                          href={`/assets/inventory/${item.id}`}
                          className={cn(textNavLinkClassName, 'rounded-sm')}
                        >
                          {item.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {item.sku ? (
                          <span dir="ltr" className="pf-numeric">
                            {item.sku}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell numeric>
                        <span dir="ltr">{item.quantityOnHand}</span>
                      </TableCell>
                      <TableCell numeric>
                        {item.reorderLevel ? <span dir="ltr">{item.reorderLevel}</span> : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge tone={reorderTone(item.reorderStatus)}>
                          {t(`inventory.reorderStatus.${item.reorderStatus}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(item) => (
            <Link
              href={`/assets/inventory/${item.id}`}
              className="flex min-h-11 min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="min-w-0 break-words font-semibold">{item.name}</p>
                <Badge tone={reorderTone(item.reorderStatus)}>
                  {t(`inventory.reorderStatus.${item.reorderStatus}`)}
                </Badge>
              </div>
              <p className="break-words text-sm text-[var(--pf-text-secondary)]">
                <span dir="ltr">{item.quantityOnHand}</span> {item.unit}
                {item.sku ? (
                  <>
                    {' · '}
                    <span dir="ltr">{item.sku}</span>
                  </>
                ) : null}
                {item.reorderLevel ? (
                  <>
                    {' · '}
                    {t('list.columns.reorderLevel')}: <span dir="ltr">{item.reorderLevel}</span>
                  </>
                ) : null}
              </p>
            </Link>
          )}
        />
      ) : null}
    </div>
  );
}
