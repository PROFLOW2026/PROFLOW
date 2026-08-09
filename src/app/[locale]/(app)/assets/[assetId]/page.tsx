import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getAssetById,
  listMaintenanceRecordsForAsset,
  type AssetStatus,
  type MaintenanceStatus,
} from '@/modules/assets';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { MaintenanceCreateForm } from './maintenance-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; assetId: string }>;
}): Promise<Metadata> {
  const { locale, assetId } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  try {
    const detail = await withOrgContext((context) => getAssetById(context, assetId));
    return { title: detail?.asset.name ?? t('title') };
  } catch {
    return { title: t('title') };
  }
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

function maintenanceShape(status: MaintenanceStatus): StatusShape {
  switch (status) {
    case 'planned':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  const t = await getTranslations('assets');
  const tAssetStatus = await getTranslations('status.asset');
  const tMaintStatus = await getTranslations('status.maintenance');

  const loaded = await withOrgContext(async (context) => {
    const detail = await getAssetById(context, assetId);
    if (!detail) return null;
    const maintenance = await listMaintenanceRecordsForAsset(context, assetId);
    return {
      detail,
      maintenance,
      canManage: hasPermission(context, PERMISSIONS.ASSETS_MANAGE),
      baseCurrency: context.organization.baseCurrency,
    };
  });

  if (!loaded) notFound();

  const { asset, fleet } = loaded.detail;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={asset.name}
        description={t(`kinds.${asset.assetKind}`)}
        breadcrumb={
          <Link href="/assets" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
        meta={
          <StatusBadge shape={assetShape(asset.status)} label={tAssetStatus(asset.status)} />
        }
      />

      <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="font-semibold">{t('detail.fleet')}</h2>
        {fleet ? (
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('createAsset.plateNumberLabel')}</dt>
              <dd>{fleet.plateNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('createAsset.vinLabel')}</dt>
              <dd>{fleet.vin ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('createAsset.odometerLabel')}</dt>
              <dd>{fleet.odometer ?? '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('detail.noFleet')}</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">{t('detail.maintenance')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.maintenanceHint')}</p>
        </div>

        {loaded.maintenance.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.emptyMaintenance')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('detail.maintenanceTitle')}</TableHead>
                  <TableHead>{t('detail.maintenanceStatus')}</TableHead>
                  <TableHead>{t('detail.performedOn')}</TableHead>
                  <TableHead>{t('detail.costAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loaded.maintenance.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell>
                      <StatusBadge
                        shape={maintenanceShape(row.status)}
                        label={tMaintStatus(row.status)}
                      />
                    </TableCell>
                    <TableCell>{row.performedOn ?? '—'}</TableCell>
                    <TableCell>
                      {row.costAmount
                        ? `${row.costAmount}${row.currency ? ` ${row.currency}` : ''}`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {loaded.canManage ? (
          <div>
            <h3 className="mb-2 text-sm font-medium">{t('detail.newMaintenance')}</h3>
            <MaintenanceCreateForm assetId={asset.id} defaultCurrency={loaded.baseCurrency} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
