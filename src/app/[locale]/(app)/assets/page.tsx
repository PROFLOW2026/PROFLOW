import { Plus, Wrench } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  listAssetsForOrg,
  listMaintenanceScheduleForOrg,
  type AssetStatus,
  type MaintenanceStatus,
} from '@/modules/assets';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AssetsSectionNav } from './assets-section-nav';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  return { title: t('title') };
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

export default async function AssetsPage() {
  const t = await getTranslations('assets');
  const tStatus = await getTranslations('status.asset');
  const tMaintStatus = await getTranslations('status.maintenance');

  const { items, schedule, canManage } = await withOrgContext(async (context) => ({
    items: await listAssetsForOrg(context),
    schedule: await listMaintenanceScheduleForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.ASSETS_MANAGE),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/assets/new">
                <Plus aria-hidden />
                {t('newAsset')}
              </Link>
            </Button>
          ) : null
        }
      />
      <AssetsSectionNav active="assets" />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">{t('schedule.title')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('schedule.hint')}</p>
          </div>
          <Link
            href="/assets/maintenance"
            className="text-sm text-[var(--pf-text-secondary)] hover:underline"
          >
            {t('schedule.viewAll')}
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="text-sm font-medium">{t('schedule.overdue')}</h3>
            {schedule.overdue.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
                {t('schedule.emptyOverdue')}
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {schedule.overdue.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/assets/${row.assetId}`} className="font-medium hover:underline">
                      {row.title}
                      <span className="font-normal text-[var(--pf-text-secondary)]">
                        {' '}
                        · {row.assetName}
                      </span>
                    </Link>
                    <span className="flex items-center gap-2">
                      <StatusBadge
                        shape={maintenanceShape(row.status)}
                        label={tMaintStatus(row.status)}
                      />
                      <span className="text-[var(--pf-text-secondary)]">{row.performedOn}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="text-sm font-medium">{t('schedule.upcoming')}</h3>
            {schedule.upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
                {t('schedule.emptyUpcoming')}
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {schedule.upcoming.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/assets/${row.assetId}`} className="font-medium hover:underline">
                      {row.title}
                      <span className="font-normal text-[var(--pf-text-secondary)]">
                        {' '}
                        · {row.assetName}
                      </span>
                    </Link>
                    <span className="text-[var(--pf-text-secondary)]">{row.performedOn}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={t('empty.assets.title')}
          description={t('empty.assets.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/assets/new">{t('empty.assets.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={items}
          getRowKey={(item) => item.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.kind')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead>{t('list.columns.identifier')}</TableHead>
                    <TableHead>{t('list.columns.manufacturer')}</TableHead>
                    <TableHead>{t('list.columns.model')}</TableHead>
                    <TableHead>{t('list.columns.assignedProject')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link href={`/assets/${item.id}`} className="font-medium hover:underline">
                          {item.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`kinds.${item.assetKind}`)}</TableCell>
                      <TableCell>
                        <StatusBadge shape={assetShape(item.status)} label={tStatus(item.status)} />
                      </TableCell>
                      <TableCell>{item.identifier ?? '—'}</TableCell>
                      <TableCell>{item.manufacturer ?? '—'}</TableCell>
                      <TableCell>{item.model ?? '—'}</TableCell>
                      <TableCell>{item.assignedProjectName ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(item) => (
            <Link
              href={`/assets/${item.id}`}
              className="block rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{item.name}</span>
                <StatusBadge shape={assetShape(item.status)} label={tStatus(item.status)} />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {t(`kinds.${item.assetKind}`)}
                {item.identifier ? ` · ${item.identifier}` : ''}
                {item.manufacturer || item.model
                  ? ` · ${[item.manufacturer, item.model].filter(Boolean).join(' ')}`
                  : ''}
                {item.assignedProjectName ? ` · ${item.assignedProjectName}` : ''}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
