import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getInventoryItemById,
  listMovementsForInventoryItem,
  type InventoryMovementType,
  type ReorderStatus,
} from '@/modules/assets';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { InventoryMovementForm } from '../inventory-movement-form';
import { InventoryMaterialUsagePanel } from '@/modules/assets/ui';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

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

const MOVEMENT_TYPES: InventoryMovementType[] = ['receive', 'issue', 'return', 'adjust'];

export default async function InventoryItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const t = await getTranslations('assets');

  const loaded = await withOrgContext(async (context) => {
    const item = await getInventoryItemById(context, itemId);
    if (!item) return null;
    const canManage = hasPermission(context, PERMISSIONS.ASSETS_MANAGE);
    const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);
    const [movements, projects, documentsPanel] = await Promise.all([
      listMovementsForInventoryItem(context, itemId),
      canReadProjects ? listProjectsForOrg(context, {}) : Promise.resolve([]),
      getEntityDocumentPanelData(context, 'inventory_item', itemId),
    ]);
    return {
      item,
      movements,
      documentsPanel,
      projects: canManage
        ? projects.map((p) => ({ id: p.id, name: p.name }))
        : [],
      canManage,
      today: todayInTimeZone(context.organization.timezone),
      projectNames: new Map(projects.map((p) => [p.id, p.name] as const)),
    };
  });

  if (!loaded) notFound();

  const { item, movements, documentsPanel, projects, canManage, today, projectNames } = loaded;

  return (
    <div className="flex min-w-0 flex-col gap-6">
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
          <Badge tone={reorderTone(item.reorderStatus)}>
            {t(`inventory.reorderStatus.${item.reorderStatus}`)}
          </Badge>
        }
      />

      <dl className="grid min-w-0 gap-3 rounded-lg border border-[var(--pf-border-default)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.sku')}</dt>
          <dd className="break-words font-medium">
            {item.sku ? (
              <span dir="ltr" className="pf-numeric">
                {item.sku}
              </span>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.unit')}</dt>
          <dd className="font-medium">{item.unit}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.quantity')}</dt>
          <dd className="font-medium tabular-nums" dir="ltr">
            {item.quantityOnHand}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.reorderLevel')}</dt>
          <dd className="font-medium">
            {item.reorderLevel ? <span dir="ltr">{item.reorderLevel}</span> : '—'}
          </dd>
        </div>
      </dl>

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

      <DocumentAttachments
        ownerType="inventory_item"
        ownerId={item.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />

      <InventoryMaterialUsagePanel inventoryItemId={item.id} />

      {canManage ? (
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('inventory.recordMovement')}</h2>
          <div className="grid min-w-0 gap-3 sm:grid-cols-1 lg:grid-cols-2">
            {MOVEMENT_TYPES.map((type) => (
              <InventoryMovementForm
                key={type}
                inventoryItemId={item.id}
                movementType={type}
                defaultDate={today}
                projects={projects}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('inventory.historyTitle')}</h2>
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
                          <span dir="ltr">{movement.quantity}</span>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate">
                          {movement.projectId
                            ? (projectNames.get(movement.projectId) ?? movement.projectId)
                            : '—'}
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate">
                          {movement.notes ?? '—'}
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
                    {movement.quantity}
                  </span>
                </div>
                <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                  {movement.occurredOn}
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
      </section>
    </div>
  );
}
