import { Handshake } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { listProjectsForOrg } from '@/modules/projects';
import { listOrgSubcontracts, listVendorsForOrg } from '@/modules/vendors';
import { money } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { SubcontractsListFilters } from './subcontracts-list-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'vendors' });
  return { title: t('subcontractsWorkspace.title') };
}

function statusShape(status: string): StatusShape {
  switch (status) {
    case 'active':
      return 'active';
    case 'draft':
      return 'pending';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function SubcontractsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string; projectId?: string; status?: string; from?: string; to?: string }>;
}) {
  const t = await getTranslations('vendors.subcontractsWorkspace');
  const tSub = await getTranslations('vendors.subcontracts');
  const params = await searchParams;
  const fromDate = params.from || undefined;
  const toDate = params.to || undefined;

  const { items, vendors, projects } = await withOrgContext(async (context) => ({
    items: await listOrgSubcontracts(context, {
      vendorId: params.vendorId && params.vendorId !== 'all' ? params.vendorId : undefined,
      projectId: params.projectId && params.projectId !== 'all' ? params.projectId : undefined,
      status:
        params.status && params.status !== 'all'
          ? (params.status as 'draft' | 'active' | 'completed' | 'cancelled')
          : 'all',
      fromDate,
      toDate,
    }),
    vendors: await listVendorsForOrg(context, {}).catch(() => []),
    projects: await listProjectsForOrg(context, {}).catch(() => []),
  }));

  return (
    <WithClientMessages extra={['vendors']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />

        <SubcontractsListFilters
          initialVendorId={params.vendorId ?? ''}
          initialProjectId={params.projectId ?? ''}
          initialStatus={params.status ?? 'all'}
          vendors={vendors.map((vendor) => ({ id: vendor.id, name: vendor.name }))}
          projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        />

        <form method="get" className="flex flex-wrap items-center gap-2">
          {params.vendorId && <input type="hidden" name="vendorId" value={params.vendorId} />}
          {params.projectId && <input type="hidden" name="projectId" value={params.projectId} />}
          {params.status && <input type="hidden" name="status" value={params.status} />}
          <DateRangeSelector fromName="from" toName="to" defaultFrom={fromDate} defaultTo={toDate} />
        </form>

        {items.length === 0 ? (
          <EmptyState icon={Handshake} title={t('empty.title')} description={t('empty.body')} />
        ) : (
          <ResponsiveTable
            items={items}
            getRowKey={(item) => item.id}
            desktop={
              <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('list.columns.vendor')}</TableHead>
                      <TableHead>{t('list.columns.project')}</TableHead>
                      <TableHead>{t('list.columns.number')}</TableHead>
                      <TableHead>{t('list.columns.status')}</TableHead>
                      <TableHead>{t('list.columns.original')}</TableHead>
                      <TableHead>{t('list.columns.current')}</TableHead>
                      <TableHead>{t('list.columns.billed')}</TableHead>
                      <TableHead>{t('list.columns.paid')}</TableHead>
                      <TableHead>{t('list.columns.outstanding')}</TableHead>
                      <TableHead>{t('list.columns.retention')}</TableHead>
                      <TableHead>{t('list.columns.dates')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link
                            href={`/vendors/${item.vendorId}`}
                            className={cn(textNavLinkClassName, 'font-medium')}
                          >
                            {item.vendorName}
                          </Link>
                        </TableCell>
                        <TableCell>{item.projectName}</TableCell>
                        <TableCell dir="ltr">
                          {item.subcontractNumber || item.title}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            shape={statusShape(item.status)}
                            label={tSub(`status.${item.status}`)}
                          />
                        </TableCell>
                        <TableCell>
                          <MoneyText value={money(item.originalAmount, item.currency)} />
                        </TableCell>
                        <TableCell>
                          <MoneyText value={money(item.currentAmount, item.currency)} />
                        </TableCell>
                        <TableCell>
                          <MoneyText value={money(item.billedAmount, item.currency)} />
                        </TableCell>
                        <TableCell>
                          <MoneyText value={money(item.paidAmount, item.currency)} />
                        </TableCell>
                        <TableCell>
                          <MoneyText value={money(item.outstandingAmount, item.currency)} />
                        </TableCell>
                        <TableCell dir="ltr">
                          {item.retentionPercent ? `${item.retentionPercent}%` : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="pf-ltr-island" dir="ltr">
                            {[item.startDate, item.endDate].filter(Boolean).join(' → ') || '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(item) => (
              <Link href={`/vendors/${item.vendorId}`} className={pressableCardLinkClassName}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {item.subcontractNumber || item.title}
                  </span>
                  <StatusBadge
                    className="shrink-0"
                    shape={statusShape(item.status)}
                    label={tSub(`status.${item.status}`)}
                  />
                </div>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                  {item.vendorName} · {item.projectName}
                </p>
              </Link>
            )}
          />
        )}
      </div>
    </WithClientMessages>
  );
}
