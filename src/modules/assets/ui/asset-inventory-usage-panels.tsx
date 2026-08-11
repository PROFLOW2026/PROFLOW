import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  listEquipmentUsageForAssetId,
  listMaterialUsageForInventoryItemId,
} from '@/modules/assets';
import { listEmployeesForOrg } from '@/modules/workforce';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import {
  ArchiveEquipmentUsageButton,
  ArchiveMaterialUsageButton,
  EquipmentUsageForm,
  MaterialUsageForm,
} from './usage-forms';

export async function AssetEquipmentUsagePanel({ assetId }: { readonly assetId: string }) {
  const t = await getTranslations('assets.usage');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.ASSETS_READ)) return null;
    const canManage = hasPermission(context, PERMISSIONS.ASSETS_MANAGE);
    const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
    const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);

    const [usage, projects, employees] = await Promise.all([
      listEquipmentUsageForAssetId(context, assetId),
      canManage && canReadProjects ? listProjectsForOrg(context, {}) : Promise.resolve([]),
      canReadWorkforce
        ? listEmployeesForOrg(context, { status: 'active' }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const projectNames = new Map(projects.map((p) => [p.id, p.name] as const));
    // Resolve names for rows even when manage is off.
    if (!canManage && canReadProjects) {
      const all = await listProjectsForOrg(context, {}).catch(() => []);
      for (const p of all) projectNames.set(p.id, p.name);
    }

    return {
      usage,
      canManage,
      today: todayInTimeZone(context.organization.timezone),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      employees: employees.map((e) => ({ id: e.id, name: e.name })),
      projectNames,
    };
  });

  if (!data) return null;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="text-start">
        <h2 className="text-base font-semibold">{t('equipmentSection')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('equipmentHint')}</p>
      </div>

      {data.canManage && data.projects.length > 0 ? (
        <EquipmentUsageForm
          defaultAssetId={assetId}
          defaultDate={data.today}
          projects={data.projects}
          employees={data.employees}
        />
      ) : null}

      {data.usage.length === 0 ? (
        <EmptyState title={t('emptyEquipment.title')} description={t('emptyEquipment.body')} />
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.date')}</TableHead>
                <TableHead>{t('columns.project')}</TableHead>
                <TableHead numeric>{t('columns.hours')}</TableHead>
                <TableHead numeric>{t('columns.days')}</TableHead>
                <TableHead numeric>{t('columns.mileage')}</TableHead>
                {data.canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.usage.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span dir="ltr">
                      {row.usageDate}
                      {row.endDate ? ` → ${row.endDate}` : ''}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${row.projectId}?tab=usage`}
                      className={cn(textNavLinkClassName, 'rounded-sm')}
                    >
                      {data.projectNames.get(row.projectId) ?? row.projectId.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell numeric>
                    <span dir="ltr">{row.hours ?? '—'}</span>
                  </TableCell>
                  <TableCell numeric>
                    <span dir="ltr">{row.days ?? '—'}</span>
                  </TableCell>
                  <TableCell numeric>
                    <span dir="ltr">{row.mileage ?? '—'}</span>
                  </TableCell>
                  {data.canManage ? (
                    <TableCell>
                      <ArchiveEquipmentUsageButton equipmentUsageId={row.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-sm text-[var(--pf-text-muted)]">{t('notActualHint')}</p>
    </Card>
  );
}

export async function InventoryMaterialUsagePanel({
  inventoryItemId,
}: {
  readonly inventoryItemId: string;
}) {
  const t = await getTranslations('assets.usage');

  const data = await withOrgContext(async (context) => {
    if (
      !hasAnyPermission(context, [PERMISSIONS.MATERIALS_READ, PERMISSIONS.ASSETS_READ])
    ) {
      return null;
    }
    const canManage = hasAnyPermission(context, [
      PERMISSIONS.MATERIALS_MANAGE,
      PERMISSIONS.ASSETS_MANAGE,
    ]);
    const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
    const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);

    const [usage, projects, employees] = await Promise.all([
      listMaterialUsageForInventoryItemId(context, inventoryItemId),
      canManage && canReadProjects ? listProjectsForOrg(context, {}) : Promise.resolve([]),
      canReadWorkforce
        ? listEmployeesForOrg(context, { status: 'active' }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const projectNames = new Map(projects.map((p) => [p.id, p.name] as const));
    if (!canManage && canReadProjects) {
      const all = await listProjectsForOrg(context, {}).catch(() => []);
      for (const p of all) projectNames.set(p.id, p.name);
    }

    return {
      usage,
      canManage,
      today: todayInTimeZone(context.organization.timezone),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      employees: employees.map((e) => ({ id: e.id, name: e.name })),
      projectNames,
    };
  });

  if (!data) return null;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="text-start">
        <h2 className="text-base font-semibold">{t('materialSection')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('materialHint')}</p>
      </div>

      {data.canManage && data.projects.length > 0 ? (
        <MaterialUsageForm
          defaultDate={data.today}
          projects={data.projects}
          inventoryItems={[{ id: inventoryItemId, name: t('thisInventoryItem') }]}
          defaultInventoryItemId={inventoryItemId}
          employees={data.employees}
        />
      ) : null}

      {data.canManage && data.projects.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('needProject')}</p>
      ) : null}

      {data.usage.length === 0 ? (
        <EmptyState title={t('emptyMaterial.title')} description={t('emptyMaterial.body')} />
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.date')}</TableHead>
                <TableHead>{t('columns.project')}</TableHead>
                <TableHead>{t('columns.description')}</TableHead>
                <TableHead numeric>{t('columns.quantity')}</TableHead>
                {data.canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.usage.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span dir="ltr">{row.usageDate}</span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${row.projectId}?tab=usage`}
                      className={cn(textNavLinkClassName, 'rounded-sm')}
                    >
                      {data.projectNames.get(row.projectId) ?? row.projectId.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate">{row.description}</TableCell>
                  <TableCell numeric>
                    <span dir="ltr">
                      {row.quantity}
                      {row.unit ? ` ${row.unit}` : ''}
                    </span>
                  </TableCell>
                  {data.canManage ? (
                    <TableCell>
                      <ArchiveMaterialUsageButton materialUsageId={row.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-sm text-[var(--pf-text-muted)]">{t('stockSeparateHint')}</p>
    </Card>
  );
}
