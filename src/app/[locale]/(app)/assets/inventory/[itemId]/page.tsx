import { notFound } from 'next/navigation';
import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getInventoryItemById,
  listInventoryLocationsForOrg,
  listInventoryReservationsForOrg,
  listMovementsForInventoryItem,
  type InventoryMovementRecord,
  type InventoryMovementType,
  type ReorderStatus,
} from '@/modules/assets';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listProjectsForOrg } from '@/modules/projects';
import { formatDecimalDisplay } from '@/shared/number/display';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { InventoryMovementForm } from '../inventory-movement-form';
import { InventoryMaterialUsagePanel } from '@/modules/assets/ui';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { Alert } from '@/components/ui/alert';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; itemId: string }>;
}): Promise<Metadata> {
  const { locale, itemId } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  try {
    const item = await withOrgContext((context) => getInventoryItemById(context, itemId));
    return { title: item?.name ?? t('inventory.title') };
  } catch {
    return { title: t('inventory.title') };
  }
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

const EMPTY = '—';

const MOVEMENT_TYPES: InventoryMovementType[] = [
  'receive',
  'issue',
  'transfer',
  'return',
  'adjust',
];

function movementLocationLabel(movement: InventoryMovementRecord): string {
  const from = movement.fromLocationName;
  const to = movement.toLocationName;
  if (from && to) return `${from} → ${to}`;
  if (to) return to;
  if (from) return from;
  return '-';
}

export default async function InventoryItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const locale = await getLocale();
  const t = await getTranslations('assets');

  const loaded = await withOrgContext(async (context) => {
    const item = await getInventoryItemById(context, itemId);
    if (!item) return null;
    const canManage = hasPermission(context, PERMISSIONS.ASSETS_MANAGE);
    const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);
    const [movements, projects, documentsPanel, locations, reservations] = await Promise.all([
      listMovementsForInventoryItem(context, itemId),
      canReadProjects ? listProjectsForOrg(context, {}) : Promise.resolve([]),
      getEntityDocumentPanelData(context, 'inventory_item', itemId),
      listInventoryLocationsForOrg(context),
      listInventoryReservationsForOrg(context, { inventoryItemId: itemId, activeOnly: true }),
    ]);
    return {
      item,
      movements,
      documentsPanel,
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        code: location.code,
      })),
      projects: canManage
        ? projects.map((p) => ({ id: p.id, name: p.name }))
        : [],
      reservations: reservations.map((row) => ({
        id: row.id,
        quantity: row.quantity,
      })),
      canManage,
      today: todayInTimeZone(context.organization.timezone),
      projectNames: new Map(projects.map((p) => [p.id, p.name] as const)),
    };
  });

  if (!loaded) notFound();

  const {
    item,
    movements,
    documentsPanel,
    locations,
    projects,
    reservations,
    canManage,
    today,
    projectNames,
  } = loaded;

  return (
    <MainAppPage>
      <PageHeader
        title={item.name}
        description={t('inventory.detailDescription')}
        breadcrumb={
          <Link
            href="/assets/inventory"
            className={textNavLinkMutedClassName}
          >
            {t('inventory.title')}
          </Link>
        }
        meta={
          <div className="flex flex-wrap gap-1">
            {item.isLowStock ? (
              <Badge tone="danger">{t('inventory.lowStockBadge')}</Badge>
            ) : (
              <Badge tone={reorderTone(item.reorderStatus)}>
                {t(`inventory.reorderStatus.${item.reorderStatus}`)}
              </Badge>
            )}
          </div>
        }
      />
      <MainAppSection>
        <Alert tone="info">
          <span className="block font-medium">{t('inventory.qtyOnlyBanner')}</span>
        </Alert>

        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('list.columns.sku')}>
            {item.sku ? (
              <span dir="ltr" className="pf-numeric">
                {item.sku}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.barcode')}>
            {item.barcode ? (
              <span dir="ltr" className="pf-numeric">
                {item.barcode}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.unit')}>{item.unit}</MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.quantity')}>
            <span className="tabular-nums" dir="ltr">
              {item.quantityOnHand}
            </span>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.available')}>
            <span className="tabular-nums" dir="ltr">
              {item.availableQuantity}
            </span>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.reserved')}>
            <span className="tabular-nums" dir="ltr">
              {item.reservedQuantity}
            </span>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.minStock')}>
            {item.minStockLevel || item.reorderLevel ? (
              <span dir="ltr">{item.minStockLevel ?? item.reorderLevel}</span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>

        {item.notes ? (
          <p className="break-words text-sm text-[var(--pf-text-secondary)]">{item.notes}</p>
        ) : null}

        {item.materialItemId ? (
          <p className="text-sm">
            <Link
              href={`/procurement/materials/${item.materialItemId}`}
              className={cn(textNavLinkMutedClassName, 'rounded-sm')}
            >
              {t('inventory.linkedMaterial')}
            </Link>
          </p>
        ) : null}

        <p className="text-sm text-[var(--pf-text-secondary)]">{t('inventory.movementNotExpense')}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('inventory.threeActionsHint')}</p>
      </MainAppSection>

      <MainAppSection title={t('inventory.balancesTitle')}>
        {item.locationBalances.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('inventory.balancesEmpty')}</p>
        ) : (
          <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.locationLabel')}</TableHead>
                  <TableHead numeric>{t('list.columns.quantity')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.locationBalances.map((balance) => (
                  <TableRow key={balance.id}>
                    <TableCell className="font-medium">
                      {balance.locationName}
                      {balance.locationCode ? (
                        <span className="text-[var(--pf-text-secondary)]">
                          {' '}
                          ({balance.locationCode})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell numeric>
                      <span dir="ltr">{formatDecimalDisplay(balance.quantity, locale)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </MainAppSection>

      <MainAppSection>
        <DocumentAttachments
          ownerType="inventory_item"
          ownerId={item.id}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage}
          storageConfigured={documentsPanel.storageConfigured}
        />
      </MainAppSection>

      <MainAppSection>
        <InventoryMaterialUsagePanel inventoryItemId={item.id} />
      </MainAppSection>

      {canManage ? (
        <MainAppSection title={t('inventory.recordMovement')}>
          <div className="grid min-w-0 gap-3 sm:grid-cols-1 lg:grid-cols-2">
            {MOVEMENT_TYPES.map((type) => (
              <InventoryMovementForm
                key={type}
                inventoryItemId={item.id}
                movementType={type}
                defaultDate={today}
                projects={projects}
                reservations={reservations}
                locations={locations}
                defaultLocationId={locations[0]?.id}
              />
            ))}
          </div>
        </MainAppSection>
      ) : null}

      <MainAppSection title={t('inventory.historyTitle')}>
        {movements.length === 0 ? (
          <EmptyState
            title={t('inventory.emptyHistory')}
            description={t('inventory.historyHint')}
          />
        ) : (
          <ResponsiveTable
            items={movements}
            getRowKey={(movement) => movement.id}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('inventory.history.columns.date')}</TableHead>
                      <TableHead>{t('inventory.history.columns.type')}</TableHead>
                      <TableHead numeric>{t('inventory.history.columns.quantity')}</TableHead>
                      <TableHead>{t('inventory.history.columns.location')}</TableHead>
                      <TableHead>{t('inventory.history.columns.project')}</TableHead>
                      <TableHead>{t('inventory.history.columns.notes')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>
                          <span dir="ltr">{movement.occurredOn}</span>
                        </TableCell>
                        <TableCell>{t(`inventory.movementTypes.${movement.movementType}`)}</TableCell>
                        <TableCell numeric>
                          <span dir="ltr">{formatDecimalDisplay(movement.quantity, locale)}</span>
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate">
                          {movementLocationLabel(movement)}
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate">
                          {movement.projectId
                            ? (projectNames.get(movement.projectId) ?? movement.projectId)
                            : '-'}
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate">
                          {movement.notes ?? '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(movement) => (
              <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {t(`inventory.movementTypes.${movement.movementType}`)}
                  </span>
                  <span className="tabular-nums" dir="ltr">
                    {formatDecimalDisplay(movement.quantity, locale)}
                  </span>
                </div>
                <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                  {movement.occurredOn}
                </p>
                <p className="break-words text-sm text-[var(--pf-text-secondary)]">
                  {movementLocationLabel(movement)}
                </p>
                {movement.projectId ? (
                  <p className="break-words text-sm text-[var(--pf-text-secondary)]">
                    {projectNames.get(movement.projectId) ?? movement.projectId}
                  </p>
                ) : null}
                {movement.notes ? (
                  <p className="break-words text-sm text-[var(--pf-text-secondary)]">
                    {movement.notes}
                  </p>
                ) : null}
              </div>
            )}
          />
        )}
      </MainAppSection>
    </MainAppPage>
  );
}
