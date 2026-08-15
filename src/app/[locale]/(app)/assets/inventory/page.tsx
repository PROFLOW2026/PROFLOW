import { Package, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listInventoryCountsForOrg, listInventoryItemsForOrg, listInventoryLocationsForOrg, listInventoryReservationsForOrg, getInventoryCountDetail, type InventoryCountLineRecord, type ReorderStatus } from '@/modules/assets';
import { listProjectsForOrg } from '@/modules/projects';
import { listMaterialsForOrg } from '@/modules/procurement';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AssetsSectionNav } from '../assets-section-nav';
import { InventoryItemCreateForm } from './inventory-item-create-form';
import { InventoryLocationsPanel } from './inventory-locations-panel';
import { InventoryReservationsPanel } from './inventory-reservations-panel';
import { InventoryCountsPanel } from './inventory-counts-panel';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { Alert } from '@/components/ui/alert';
import { todayInTimeZone } from '@/shared/dates/dates';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

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
  searchParams: Promise<{ new?: string; q?: string }>;
}) {
  const t = await getTranslations('assets');
  const tCommon = await getTranslations('common');
  const { new: showNew, q: search } = await searchParams;
  const query = search?.trim() ?? '';

  const loaded = await withOrgContext(async (context) => {
    const canReadMaterials = hasPermission(context, PERMISSIONS.MATERIALS_READ);
    const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);
    const items = await listInventoryItemsForOrg(context, { search: query || undefined });
    const [locations, reservations, counts, materials, projects, workOrders] = await Promise.all([
      listInventoryLocationsForOrg(context),
      listInventoryReservationsForOrg(context, { activeOnly: true }),
      listInventoryCountsForOrg(context),
      canReadMaterials
        ? (await listMaterialsForOrg(context)).map((m) => ({
            id: m.id,
            name: m.name,
            sku: m.sku,
          }))
        : Promise.resolve([]),
      canReadProjects ? listProjectsForOrg(context, {}) : Promise.resolve([]),
      canReadProjects
        ? listProjectsForOrg(context, { workKind: 'work_order' })
        : Promise.resolve([]),
    ]);

    const itemNames = new Map(items.map((item) => [item.id, item.name] as const));
    const linesByCount = new Map<string, readonly InventoryCountLineRecord[]>();
    await Promise.all(
      counts.slice(0, 8).map(async (count) => {
        const detail = await getInventoryCountDetail(context, count.id);
        linesByCount.set(count.id, detail?.lines ?? []);
      }),
    );

    return {
      items,
      locations,
      reservations: reservations.map((row) => ({
        ...row,
        itemName: itemNames.get(row.inventoryItemId) ?? row.inventoryItemId,
      })),
      counts,
      linesByCount,
      materials,
      projects: projects
        .filter((row) => row.workKind !== 'work_order')
        .map((row) => ({ id: row.id, name: row.name })),
      workOrders: workOrders.map((row) => ({ id: row.id, name: row.name })),
      canManage: hasPermission(context, PERMISSIONS.ASSETS_MANAGE),
      today: todayInTimeZone(context.organization.timezone),
    };
  });

  const {
    items,
    locations,
    reservations,
    counts,
    linesByCount,
    materials,
    projects,
    workOrders,
    canManage,
    today,
  } = loaded;

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
        locations={locations.map((location) => ({
          id: location.id,
          name: location.name,
          code: location.code,
          locationKind: location.locationKind,
        }))}
        canManage={canManage}
      />

      <form method="get" role="search" className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
        <Field label={t('inventory.searchLabel')} className="flex-1">
          {(control) => (
            <Input
              {...control}
              type="search"
              name="q"
              defaultValue={query}
              placeholder={t('inventory.searchPlaceholder')}
              dir="ltr"
            />
          )}
        </Field>
        <Button type="submit" variant="secondary" className="min-h-11 md:min-h-8">
          {tCommon('actions.search')}
        </Button>
      </form>

      <InventoryReservationsPanel
        items={items.map((item) => ({ id: item.id, name: item.name, unit: item.unit }))}
        reservations={reservations}
        projects={projects}
        workOrders={workOrders}
        canManage={canManage}
      />

      <InventoryCountsPanel
        locations={locations.map((location) => ({
          id: location.id,
          name: location.name,
          code: location.code,
        }))}
        items={items.map((item) => ({ id: item.id, name: item.name }))}
        counts={counts}
        linesByCount={linesByCount}
        canManage={canManage}
        defaultDate={today}
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
                    <TableHead>{t('list.columns.barcode')}</TableHead>
                    <TableHead>{t('list.columns.unit')}</TableHead>
                    <TableHead numeric>{t('list.columns.quantity')}</TableHead>
                    <TableHead numeric>{t('list.columns.available')}</TableHead>
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
                      <TableCell>
                        {item.barcode ? (
                          <span dir="ltr" className="pf-numeric">
                            {item.barcode}
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
                        <span dir="ltr">{item.availableQuantity}</span>
                      </TableCell>
                      <TableCell numeric>
                        {item.minStockLevel || item.reorderLevel ? (
                          <span dir="ltr">{item.minStockLevel ?? item.reorderLevel}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.isLowStock ? (
                            <Badge tone="danger">{t('inventory.lowStockBadge')}</Badge>
                          ) : (
                            <Badge tone={reorderTone(item.reorderStatus)}>
                              {t(`inventory.reorderStatus.${item.reorderStatus}`)}
                            </Badge>
                          )}
                        </div>
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
                {item.isLowStock ? (
                  <Badge tone="danger">{t('inventory.lowStockBadge')}</Badge>
                ) : (
                  <Badge tone={reorderTone(item.reorderStatus)}>
                    {t(`inventory.reorderStatus.${item.reorderStatus}`)}
                  </Badge>
                )}
              </div>
              <p className="break-words text-sm text-[var(--pf-text-secondary)]">
                <span dir="ltr">{item.quantityOnHand}</span> {item.unit}
                {' · '}
                {t('list.columns.available')}: <span dir="ltr">{item.availableQuantity}</span>
                {item.sku ? (
                  <>
                    {' · '}
                    <span dir="ltr">{item.sku}</span>
                  </>
                ) : null}
                {item.barcode ? (
                  <>
                    {' · '}
                    <span dir="ltr">{item.barcode}</span>
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
