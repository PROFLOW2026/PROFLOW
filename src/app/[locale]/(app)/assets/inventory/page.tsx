import { Package, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listInventoryItemsForOrg } from '@/modules/assets';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AssetsSectionNav } from '../assets-section-nav';
import { InventoryItemCreateForm } from './inventory-item-create-form';
import { InventoryMovementForm } from './inventory-movement-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  return { title: t('inventory.title') };
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const t = await getTranslations('assets');
  const { new: showNew } = await searchParams;

  const { items, canManage, today } = await withOrgContext(async (context) => ({
    items: await listInventoryItemsForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.ASSETS_MANAGE),
    today: todayInTimeZone(context.organization.timezone),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('inventory.title')}
        description={t('inventory.description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/assets/inventory?new=1">
                <Plus aria-hidden />
                {t('newInventoryItem')}
              </Link>
            </Button>
          ) : null
        }
      />
      <AssetsSectionNav active="inventory" />

      {canManage && showNew === '1' ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="mb-3 font-semibold">{t('inventory.createTitle')}</h2>
          <InventoryItemCreateForm />
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
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.sku')}</TableHead>
                    <TableHead>{t('list.columns.unit')}</TableHead>
                    <TableHead>{t('list.columns.quantity')}</TableHead>
                    {canManage ? <TableHead>{t('list.columns.actions')}</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.sku ?? '—'}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>{item.quantityOnHand}</TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <InventoryMovementForm
                              inventoryItemId={item.id}
                              movementType="receive"
                              defaultDate={today}
                            />
                            <InventoryMovementForm
                              inventoryItemId={item.id}
                              movementType="issue"
                              defaultDate={today}
                            />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(item) => (
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {item.quantityOnHand} {item.unit}
                  {item.sku ? ` · ${item.sku}` : ''}
                </p>
              </div>
              {canManage ? (
                <>
                  <InventoryMovementForm
                    inventoryItemId={item.id}
                    movementType="receive"
                    defaultDate={today}
                  />
                  <InventoryMovementForm
                    inventoryItemId={item.id}
                    movementType="issue"
                    defaultDate={today}
                  />
                </>
              ) : null}
            </div>
          )}
        />
      ) : null}
    </div>
  );
}
