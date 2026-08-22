import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  listAssetsForOrg,
  listEquipmentUsageForProjectId,
  listInventoryItemsForOrg,
  listMaterialUsageForProjectId,
} from '@/modules/assets';
import { listMaterialsForOrg } from '@/modules/procurement';
import { listEmployeesForOrg } from '@/modules/workforce';
import { peekOpsExpenseLinksForRecords } from '@/modules/ops-finance';
import { CreateLinkedExpenseForm } from '@/modules/ops-finance/ui/create-linked-expense-form';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  ArchiveEquipmentUsageButton,
  ArchiveMaterialUsageButton,
  EquipmentUsageForm,
  MaterialUsageForm,
} from './usage-forms';

export interface ProjectUsagePanelProps {
  readonly projectId: string;
}

/**
 * Project / job / work-order usage tab.
 * Material + equipment attribution only - never Actual cost.
 */
export async function ProjectUsagePanel({ projectId }: ProjectUsagePanelProps) {
  const t = await getTranslations('assets.usage');

  const data = await withOrgContext(async (context) => {
    const canReadMaterials = hasAnyPermission(context, [
      PERMISSIONS.MATERIALS_READ,
      PERMISSIONS.ASSETS_READ,
    ]);
    const canReadAssets = hasPermission(context, PERMISSIONS.ASSETS_READ);
    if (!canReadMaterials && !canReadAssets) return null;

    const canManageMaterials = hasAnyPermission(context, [
      PERMISSIONS.MATERIALS_MANAGE,
      PERMISSIONS.ASSETS_MANAGE,
    ]);
    const canManageAssets = hasPermission(context, PERMISSIONS.ASSETS_MANAGE);
    const canCreateExpense = hasPermission(context, PERMISSIONS.EXPENSES_CREATE);
    const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);

    const [
      materialUsage,
      equipmentUsage,
      materials,
      inventoryItems,
      assets,
      employees,
    ] = await Promise.all([
      canReadMaterials
        ? listMaterialUsageForProjectId(context, projectId).catch(() => [])
        : Promise.resolve([]),
      canReadAssets
        ? listEquipmentUsageForProjectId(context, projectId).catch(() => [])
        : Promise.resolve([]),
      canManageMaterials && hasPermission(context, PERMISSIONS.MATERIALS_READ)
        ? listMaterialsForOrg(context).catch(() => [])
        : Promise.resolve([]),
      canManageMaterials && hasPermission(context, PERMISSIONS.ASSETS_READ)
        ? listInventoryItemsForOrg(context).catch(() => [])
        : Promise.resolve([]),
      canManageAssets ? listAssetsForOrg(context).catch(() => []) : Promise.resolve([]),
      canReadWorkforce
        ? listEmployeesForOrg(context, { status: 'active' }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const assetNames = new Map(assets.map((asset) => [asset.id, asset.name] as const));
    // Names for list rows when assets list was not loaded (read-only).
    if (!canManageAssets && canReadAssets) {
      const allAssets = await listAssetsForOrg(context).catch(() => []);
      for (const asset of allAssets) assetNames.set(asset.id, asset.name);
    }

    const materialLinks = canCreateExpense
      ? await peekOpsExpenseLinksForRecords(
          context,
          'material_usage_record',
          materialUsage.map((row) => row.id),
        )
      : [];
    const equipmentLinks = canCreateExpense
      ? await peekOpsExpenseLinksForRecords(
          context,
          'equipment_usage_record',
          equipmentUsage.map((row) => row.id),
        )
      : [];

    return {
      materialUsage,
      equipmentUsage,
      canManageMaterials,
      canManageAssets,
      canCreateExpense,
      canReadMaterials,
      canReadAssets,
      linkedMaterialExpenseById: new Map(
        materialLinks.map((link) => [link.opsRecordId, link.expenseId] as const),
      ),
      linkedEquipmentExpenseById: new Map(
        equipmentLinks.map((link) => [link.opsRecordId, link.expenseId] as const),
      ),
      today: todayInTimeZone(context.organization.timezone),
      currency: context.organization.baseCurrency,
      materials: materials.map((m) => ({ id: m.id, name: m.name, subtitle: m.sku })),
      inventoryItems: inventoryItems.map((item) => ({
        id: item.id,
        name: item.name,
        subtitle: `${item.quantityOnHand} ${item.unit}`,
      })),
      assets: assets
        .filter((asset) => asset.status === 'active')
        .map((asset) => ({
          id: asset.id,
          name: asset.name,
          subtitle: asset.assetKind,
        })),
      employees: employees.map((employee) => ({ id: employee.id, name: employee.name })),
      assetNames,
    };
  });

  if (!data) return null;

  return (
    <WithClientMessages extra={['assets']}>
      <div className="flex flex-col gap-6">
        <p className="text-sm text-[var(--pf-text-muted)]">{t('panelNote')}</p>
        <p className="text-sm text-[var(--pf-text-muted)]">{t('threeActionsHint')}</p>

        {data.canReadMaterials ? (
          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="text-start">
              <h2 className="text-base font-semibold">{t('materialSection')}</h2>
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('materialHint')}</p>
            </div>

            {data.canManageMaterials ? (
              <MaterialUsageForm
                projectId={projectId}
                defaultDate={data.today}
                materials={data.materials}
                inventoryItems={data.inventoryItems}
                employees={data.employees}
              />
            ) : null}

            {data.materialUsage.length === 0 ? (
              <EmptyState title={t('emptyMaterial.title')} description={t('emptyMaterial.body')} />
            ) : (
              <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('columns.date')}</TableHead>
                      <TableHead>{t('columns.description')}</TableHead>
                      <TableHead numeric>{t('columns.quantity')}</TableHead>
                      <TableHead>{t('columns.unit')}</TableHead>
                      <TableHead>{t('columns.notes')}</TableHead>
                      {data.canManageMaterials || data.canCreateExpense ? (
                        <TableHead>{t('columns.actions')}</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.materialUsage.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span dir="ltr">{row.usageDate}</span>
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate font-medium">
                          {row.description}
                        </TableCell>
                        <TableCell numeric>
                          <span dir="ltr">{row.quantity}</span>
                        </TableCell>
                        <TableCell>{row.unit ?? '-'}</TableCell>
                        <TableCell className="max-w-[12rem] truncate text-[var(--pf-text-secondary)]">
                          {row.notes ?? '-'}
                        </TableCell>
                        {data.canManageMaterials || data.canCreateExpense ? (
                          <TableCell>
                            <div className="flex min-w-0 flex-col gap-2">
                              {data.canCreateExpense ? (
                                <CreateLinkedExpenseForm
                                  namespace="assets"
                                  opsRecordKind="material_usage_record"
                                  opsRecordId={row.id}
                                  defaultCurrency={data.currency}
                                  defaultDescription={row.description}
                                  revalidatePath={`/projects/${projectId}?tab=usage`}
                                  existingExpenseId={
                                    data.linkedMaterialExpenseById.get(row.id) ?? null
                                  }
                                  compact
                                />
                              ) : null}
                              {data.canManageMaterials ? (
                                <ArchiveMaterialUsageButton materialUsageId={row.id} />
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        ) : null}

        {data.canReadAssets ? (
          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="text-start">
              <h2 className="text-base font-semibold">{t('equipmentSection')}</h2>
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('equipmentHint')}</p>
            </div>

            {data.canManageAssets && data.assets.length > 0 ? (
              <EquipmentUsageForm
                projectId={projectId}
                defaultDate={data.today}
                assets={data.assets}
                employees={data.employees}
              />
            ) : null}

            {data.equipmentUsage.length === 0 ? (
              <EmptyState title={t('emptyEquipment.title')} description={t('emptyEquipment.body')} />
            ) : (
              <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('columns.date')}</TableHead>
                      <TableHead>{t('columns.asset')}</TableHead>
                      <TableHead numeric>{t('columns.hours')}</TableHead>
                      <TableHead numeric>{t('columns.days')}</TableHead>
                      <TableHead numeric>{t('columns.mileage')}</TableHead>
                      <TableHead>{t('columns.notes')}</TableHead>
                      {data.canManageAssets || data.canCreateExpense ? (
                        <TableHead>{t('columns.actions')}</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.equipmentUsage.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span dir="ltr">
                            {row.usageDate}
                            {row.endDate ? ` → ${row.endDate}` : ''}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate font-medium">
                          {data.assetNames.get(row.assetId) ?? row.assetId.slice(0, 8)}
                        </TableCell>
                        <TableCell numeric>
                          <span dir="ltr">{row.hours ?? '-'}</span>
                        </TableCell>
                        <TableCell numeric>
                          <span dir="ltr">{row.days ?? '-'}</span>
                        </TableCell>
                        <TableCell numeric>
                          <span dir="ltr">{row.mileage ?? '-'}</span>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate text-[var(--pf-text-secondary)]">
                          {row.notes ?? '-'}
                        </TableCell>
                        {data.canManageAssets || data.canCreateExpense ? (
                          <TableCell>
                            <div className="flex min-w-0 flex-col gap-2">
                              {data.canCreateExpense ? (
                                <CreateLinkedExpenseForm
                                  namespace="assets"
                                  opsRecordKind="equipment_usage_record"
                                  opsRecordId={row.id}
                                  assetId={row.assetId}
                                  defaultCurrency={data.currency}
                                  defaultDescription={t('equipmentExpenseDescription')}
                                  revalidatePath={`/projects/${projectId}?tab=usage`}
                                  existingExpenseId={
                                    data.linkedEquipmentExpenseById.get(row.id) ?? null
                                  }
                                  compact
                                />
                              ) : null}
                              {data.canManageAssets ? (
                                <ArchiveEquipmentUsageButton equipmentUsageId={row.id} />
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        ) : null}
      </div>
    </WithClientMessages>
  );
}
