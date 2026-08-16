import { Car, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { pressableClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/shared/ui/cn';
import {
  listFleetVehiclesForOrg,
  listLinkableVehicleAssets,
  type AssetStatus,
} from '@/modules/assets';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AssetsSectionNav } from '../assets-section-nav';
import { FleetVehicleCreateForm, FleetVehicleEditForm } from './fleet-forms';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  return { title: t('fleet.title') };
}

function assetShape(status: AssetStatus): StatusShape {
  switch (status) {
    case 'active':
      return 'active';
    case 'in_maintenance':
      return 'pending';
    case 'retired':
      return 'onHold';
    case 'disposed':
      return 'archived';
    default:
      return 'archived';
  }
}

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const t = await getTranslations('assets');
  const tStatus = await getTranslations('status.asset');
  const { new: showNew } = await searchParams;

  const { items, linkable, canManage } = await withOrgContext(async (context) => {
    const manage = hasPermission(context, PERMISSIONS.ASSETS_MANAGE);
    return {
      items: await listFleetVehiclesForOrg(context),
      linkable: manage ? await listLinkableVehicleAssets(context) : [],
      canManage: manage,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('fleet.title')}
        description={t('fleet.description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/assets/fleet?new=1">
                <Plus aria-hidden />
                {t('newFleetVehicle')}
              </Link>
            </Button>
          ) : null
        }
      />
      <AssetsSectionNav active="fleet" />

      <Alert tone="info" title={t('fleet.schemaLimitsTitle')}>
        <p>{t('fleet.schemaLimitsBody')}</p>
        <details className="mt-2 text-sm">
          <summary
            className={cn(
              pressableClassName,
              'cursor-pointer select-none active:scale-100 active:opacity-80',
            )}
          >
            {t('fleet.moreInfo')}
          </summary>
          <p className="mt-2 leading-relaxed">{t('fleet.schemaLimitsDetails')}</p>
        </details>
      </Alert>

      {canManage && showNew === '1' ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="mb-3 font-semibold">{t('fleet.createTitle')}</h2>
          <FleetVehicleCreateForm
            linkableAssets={linkable.map((a) => ({ id: a.id, name: a.name }))}
          />
        </div>
      ) : null}

      {items.length === 0 && showNew !== '1' ? (
        <EmptyState
          icon={Car}
          title={t('empty.fleet.title')}
          description={t('empty.fleet.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/assets/fleet?new=1">{t('empty.fleet.action')}</Link>
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
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead>{t('list.columns.assignedProject')}</TableHead>
                    <TableHead>{t('list.columns.plate')}</TableHead>
                    <TableHead>{t('list.columns.vin')}</TableHead>
                    <TableHead numeric>{t('list.columns.odometer')}</TableHead>
                    {canManage ? <TableHead>{t('list.columns.actions')}</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link
                          href={`/assets/${item.assetId}`}
                          className={cn(textNavLinkClassName, 'font-medium')}
                        >
                          {item.assetName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={assetShape(item.assetStatus)}
                          label={tStatus(item.assetStatus)}
                        />
                      </TableCell>
                      <TableCell>{item.assignedProjectName ?? '-'}</TableCell>
                      <TableCell>
                        {item.plateNumber ? (
                          <span className="pf-ltr-island pf-entity-string" dir="ltr">
                            {item.plateNumber}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {item.vin ? (
                          <span className="pf-ltr-island pf-entity-string" dir="ltr">
                            {item.vin}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell numeric>
                        {item.odometer ? (
                          <span dir="ltr">{item.odometer}</span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <FleetVehicleEditForm
                            fleetVehicleId={item.id}
                            plateNumber={item.plateNumber}
                            vin={item.vin}
                            odometer={item.odometer}
                            notes={item.notes}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(item) => (
            <div className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/assets/${item.assetId}`}
                  className={cn(textNavLinkClassName, 'min-w-0 flex-1 font-semibold')}
                >
                  {item.assetName}
                </Link>
                <StatusBadge
                  shape={assetShape(item.assetStatus)}
                  label={tStatus(item.assetStatus)}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {item.assignedProjectName ? `${item.assignedProjectName} · ` : null}
                {item.plateNumber ? (
                  <span className="pf-ltr-island pf-entity-string" dir="ltr">
                    {item.plateNumber}
                  </span>
                ) : null}
                {item.vin ? (
                  <>
                    {item.plateNumber ? ' · ' : null}
                    <span className="pf-ltr-island pf-entity-string" dir="ltr">
                      {item.vin}
                    </span>
                  </>
                ) : null}
                {item.odometer ? (
                  <>
                    {item.plateNumber || item.vin ? ' · ' : null}
                    <span className="pf-numeric" dir="ltr">
                      {item.odometer}
                    </span>
                  </>
                ) : null}
                {!item.assignedProjectName && !item.plateNumber && !item.vin && !item.odometer
                  ? '-'
                  : null}
              </p>
              {canManage ? (
                <div className="mt-3">
                  <FleetVehicleEditForm
                    fleetVehicleId={item.id}
                    plateNumber={item.plateNumber}
                    vin={item.vin}
                    odometer={item.odometer}
                    notes={item.notes}
                  />
                </div>
              ) : null}
            </div>
          )}
        />
      ) : null}
    </div>
  );
}
