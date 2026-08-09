import { Wrench } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  listMaintenanceScheduleForOrg,
  type MaintenanceStatus,
} from '@/modules/assets';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { AssetsSectionNav } from '../assets-section-nav';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  return { title: t('schedule.title') };
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

type ScheduleRow = Awaited<
  ReturnType<typeof listMaintenanceScheduleForOrg>
>['all'][number];

function MaintenanceTable({
  items,
  t,
  tStatus,
}: {
  readonly items: readonly ScheduleRow[];
  readonly t: Awaited<ReturnType<typeof getTranslations<'assets'>>>;
  readonly tStatus: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <ResponsiveTable
      items={items}
      getRowKey={(row) => row.id}
      desktop={
        <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('list.columns.name')}</TableHead>
                <TableHead>{t('detail.maintenanceTitle')}</TableHead>
                <TableHead>{t('detail.maintenanceStatus')}</TableHead>
                <TableHead>{t('detail.performedOn')}</TableHead>
                <TableHead numeric>{t('detail.costAmount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/assets/${row.assetId}`} className="font-medium hover:underline">
                      {row.assetName}
                    </Link>
                  </TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>
                    <StatusBadge
                      shape={maintenanceShape(row.status)}
                      label={tStatus(row.status)}
                    />
                  </TableCell>
                  <TableCell>
                    {row.performedOn ? (
                      <span className="pf-ltr-island" dir="ltr">
                        {row.performedOn}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell numeric>
                    {row.costAmount ? (
                      <span dir="ltr">
                        {`${row.costAmount}${row.currency ? ` ${row.currency}` : ''}`}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      }
      renderMobileCard={(row) => (
        <Link
          href={`/assets/${row.assetId}`}
          className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{row.assetName}</p>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{row.title}</p>
            </div>
            <StatusBadge shape={maintenanceShape(row.status)} label={tStatus(row.status)} />
          </div>
          <p className="mt-2 text-xs text-[var(--pf-text-muted)]">
            <span className="pf-ltr-island" dir="ltr">
              {row.performedOn ?? '—'}
            </span>
            {row.costAmount ? (
              <>
                {' · '}
                <span className="pf-numeric" dir="ltr">
                  {`${row.costAmount}${row.currency ? ` ${row.currency}` : ''}`}
                </span>
              </>
            ) : null}
          </p>
        </Link>
      )}
    />
  );
}

export default async function MaintenanceSchedulePage() {
  const t = await getTranslations('assets');
  const tStatus = await getTranslations('status.maintenance');

  const schedule = await withOrgContext((context) => listMaintenanceScheduleForOrg(context));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('schedule.title')} description={t('schedule.hint')} />
      <AssetsSectionNav active="maintenance" />

      {schedule.all.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={t('empty.maintenance.title')}
          description={t('empty.maintenance.body')}
        />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t('schedule.overdue')}</h2>
            {schedule.overdue.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('schedule.emptyOverdue')}</p>
            ) : (
              <MaintenanceTable items={schedule.overdue} t={t} tStatus={tStatus} />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t('schedule.upcoming')}</h2>
            {schedule.upcoming.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('schedule.emptyUpcoming')}</p>
            ) : (
              <MaintenanceTable items={schedule.upcoming} t={t} tStatus={tStatus} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
