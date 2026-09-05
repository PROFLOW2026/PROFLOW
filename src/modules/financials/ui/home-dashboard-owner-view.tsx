import type React from 'react';
import { AlertCircle, Plus, Receipt } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PrefetchOnIntentLink } from '@/components/ui/prefetch-on-intent-link';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/shared/ui/cn';
import { ProjectStatusBadge } from '@/app/[locale]/(app)/projects/project-status-badge';
import type { ProjectStatus } from '@/modules/projects';
import type { HomeDashboardData } from '../application/get-home-dashboard';
import { partitionDashboardCompletenessItems } from '../domain/dashboard-missing-data';
import { DashboardMissingDataTrigger } from './dashboard-missing-data-trigger';
import { HomeLaborReconciliation, HomePendingTimeAlert } from './home-labor-alerts';
import { mapDashboardMissingDataToView } from './map-dashboard-missing-data-view';

interface HomeDashboardOwnerViewProps {
  readonly data: HomeDashboardData;
}

function KpiTile({
  title,
  money,
  percent,
  hint,
  footer,
  unavailable,
  unavailableLabel,
}: {
  title: string;
  money?: { amount: string; currency: string };
  percent?: string | null;
  hint?: string;
  footer?: React.ReactNode;
  unavailable?: boolean;
  unavailableLabel?: string;
}) {
  return (
    <Card className="min-w-0 max-w-full">
      <CardContent className="flex min-w-0 flex-col gap-1 p-4">
        <p className="text-xs text-[var(--pf-text-muted)]">{title}</p>
        {unavailable ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{unavailableLabel}</p>
        ) : percent != null ? (
          <p className="text-lg font-semibold tabular-nums" dir="ltr">
            {percent}%
          </p>
        ) : money ? (
          <p className="min-w-0 max-w-full overflow-x-auto text-lg font-semibold">
            <MoneyText value={money} />
          </p>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
        )}
        {hint ? <p className="break-words text-xs text-[var(--pf-text-muted)]">{hint}</p> : null}
        {footer}
      </CardContent>
    </Card>
  );
}

export async function HomeDashboardOwnerView({ data }: HomeDashboardOwnerViewProps) {
  const [t, tFinancial, tNav, tStatus, locale] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('financial'),
    getTranslations('nav'),
    getTranslations('status.project'),
    getLocale(),
  ]);

  const hasAttention =
    data.attention.pendingChangesCount > 0 ||
    data.attention.unbilledApprovedCount > 0 ||
    data.attention.overdueBillingCount > 0;

  const contractUnavailable = data.kpiAvailability?.contractValue === 'unavailable';
  const costUnavailable = data.kpiAvailability?.actualCost === 'unavailable';
  const profitUnavailable = data.kpiAvailability?.actualMargin === 'unavailable';

  const completenessPartitions = partitionDashboardCompletenessItems(data.missingDataItems);
  const translateDashboard = (key: string, values?: Record<string, string | number>) =>
    t(key, values as Record<string, string | number> | undefined);
  const missingDataItemsView = mapDashboardMissingDataToView(
    completenessPartitions.missing,
    translateDashboard,
    { locale },
  );
  const attentionItemsView = mapDashboardMissingDataToView(
    completenessPartitions.attention,
    translateDashboard,
    { locale },
  );
  const hasCompletenessTrigger =
    missingDataItemsView.length > 0 || attentionItemsView.length > 0;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      {data.pendingTime ? (
        <HomePendingTimeAlert pendingTime={data.pendingTime} canApproveTime={data.canApproveTime} />
      ) : null}
      {data.laborReconciliation ? (
        <HomeLaborReconciliation laborReconciliation={data.laborReconciliation} />
      ) : null}
      {hasCompletenessTrigger ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <DashboardMissingDataTrigger
            missingItems={missingDataItemsView}
            attentionItems={attentionItemsView}
            copy={{
              missingButtonOne: t('missingData.missingButtonOne'),
              missingButtonMany: t.raw('missingData.missingButtonMany') as string,
              attentionButtonOne: t('missingData.attentionButtonOne'),
              attentionButtonMany: t.raw('missingData.attentionButtonMany') as string,
              modalTitle: t('missingData.modalTitle'),
              modalDescription: t('missingData.modalDescription'),
              sectionMissing: t('missingData.sectionMissing'),
              sectionAttention: t('missingData.sectionAttention'),
              missingItemLabel: t('missingData.missingItemLabel'),
              attentionItemLabel: t('missingData.attentionItemLabel'),
            }}
          />
        </div>
      ) : null}
      <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title={t('ownerHeadline.workValue')}
          money={data.totalContractValue ?? undefined}
          unavailable={contractUnavailable}
          unavailableLabel={t('missingData.kpiUnavailable')}
        />
        <KpiTile
          title={tFinancial('actualCostToDate')}
          money={data.totalActualCost ?? data.forecast?.totalActualProjectCost ?? undefined}
          unavailable={costUnavailable}
          unavailableLabel={t('missingData.kpiUnavailable')}
          hint={costUnavailable ? undefined : tFinancial('basis.actualNotCash')}
        />
        <KpiTile
          title={t('ownerHeadline.actualProfit')}
          money={data.actualProfitTotal ?? undefined}
          unavailable={profitUnavailable}
          unavailableLabel={t('missingData.kpiUnavailable')}
        />
        <KpiTile
          title={t('ownerHeadline.profitability')}
          percent={data.profitabilityPercent}
          unavailable={profitUnavailable && !data.profitabilityPercent}
          unavailableLabel={t('missingData.kpiUnavailable')}
        />
      </section>

      {/* FIN-HIGH-001: AP outstanding — what the business owes vendors in unpaid bills */}
      {data.apOutstanding ? (
        <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            title={tFinancial('apOutstanding')}
            money={data.apOutstanding}
            hint={tFinancial('apOutstandingHint')}
            footer={
              <p className="break-words text-xs">
                <Link
                  href="/procurement/ap?status=open"
                  className={textNavLinkClassName}
                  prefetch={false}
                >
                  {t('businessSummary.viewApOutstanding')}
                </Link>
              </p>
            }
          />
        </section>
      ) : null}

      {data.projectTableRows.length > 0 ? (
        <section className="min-w-0 max-w-full">
          <h2 className="mb-3 text-sm font-semibold">{t('ownerHeadline.projectTableTitle')}</h2>
          <ResponsiveTable
            items={[...data.projectTableRows]}
            getRowKey={(row) => row.projectId}
            desktop={
              <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('ownerHeadline.colProject')}</TableHead>
                      <TableHead className="hidden md:table-cell">
                        {t('ownerHeadline.colClient')}
                      </TableHead>
                      <TableHead numeric>{t('ownerHeadline.colValue')}</TableHead>
                      <TableHead numeric>{t('ownerHeadline.colActual')}</TableHead>
                      <TableHead numeric>{t('ownerHeadline.colProfit')}</TableHead>
                      <TableHead numeric>{t('ownerHeadline.colProfitability')}</TableHead>
                      <TableHead>{t('ownerHeadline.colStatus')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.projectTableRows.map((row) => (
                      <TableRow key={row.projectId}>
                        <TableCell>
                          <PrefetchOnIntentLink
                            href={`/projects/${row.projectId}`}
                            className={cn(textNavLinkClassName, 'font-medium')}
                          >
                            {row.name}
                          </PrefetchOnIntentLink>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{row.clientName ?? '—'}</TableCell>
                        <TableCell numeric>
                          {row.currentContract ? <MoneyText value={row.currentContract} /> : '—'}
                        </TableCell>
                        <TableCell numeric>
                          {row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}
                        </TableCell>
                        <TableCell numeric>
                          {row.actualProfit ? <MoneyText value={row.actualProfit} /> : '—'}
                        </TableCell>
                        <TableCell numeric>
                          {row.marginPercent ? (
                            <span dir="ltr">{row.marginPercent}%</span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <ProjectStatusBadge
                            status={row.status as ProjectStatus}
                            label={tStatus(row.status as ProjectStatus)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(row) => (
              <Link
                href={`/projects/${row.projectId}`}
                className={cn(pressableCardLinkClassName, 'text-start')}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{row.name}</span>
                  <ProjectStatusBadge
                    status={row.status as ProjectStatus}
                    label={tStatus(row.status as ProjectStatus)}
                  />
                </div>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                  {row.clientName ?? '—'}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-[var(--pf-text-muted)]">{t('ownerHeadline.colValue')}</dt>
                  <dd className="text-end">
                    {row.currentContract ? <MoneyText value={row.currentContract} /> : '—'}
                  </dd>
                  <dt className="text-[var(--pf-text-muted)]">{t('ownerHeadline.colActual')}</dt>
                  <dd className="text-end">
                    {row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}
                  </dd>
                  <dt className="text-[var(--pf-text-muted)]">{t('ownerHeadline.colProfit')}</dt>
                  <dd className="text-end">
                    {row.actualProfit ? <MoneyText value={row.actualProfit} /> : '—'}
                  </dd>
                  <dt className="text-[var(--pf-text-muted)]">
                    {t('ownerHeadline.colProfitability')}
                  </dt>
                  <dd className="text-end" dir="ltr">
                    {row.marginPercent ? `${row.marginPercent}%` : '—'}
                  </dd>
                </dl>
              </Link>
            )}
          />
        </section>
      ) : data.activeProjectCount > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t('activeProjects')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('ownerHeadline.noFinancialRows', { count: data.activeProjectCount })}
          </p>
          <p className="mt-2">
            <Link href="/projects" className={textNavLinkClassName} prefetch={false}>
              {tNav('projects')}
            </Link>
          </p>
        </section>
      ) : null}

      {hasAttention ? (
        <section className="min-w-0 max-w-full">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {t('attention.title')}
          </h2>
          <ul className="flex min-w-0 flex-col gap-2 text-sm">
            {data.attention.pendingChangesCount > 0 ? (
              <li className="rounded-md border border-[var(--pf-border-default)] px-3 py-2">
                {t('attention.pendingChanges', { count: data.attention.pendingChangesCount })}
              </li>
            ) : null}
            {data.attention.unbilledApprovedCount > 0 ? (
              <li className="rounded-md border border-[var(--pf-border-default)] px-3 py-2">
                {t('attention.approvedNotBilled', { count: data.attention.unbilledApprovedCount })}
              </li>
            ) : null}
            {data.attention.overdueBillingCount > 0 ? (
              <li className="rounded-md border border-[var(--pf-border-default)] px-3 py-2">
                {t('attention.overdueBilling', { count: data.attention.overdueBillingCount })}
              </li>
            ) : null}
          </ul>
          {data.canReadToday ? (
            <p className="mt-3">
              <Link href="/today" className={textNavLinkClassName} prefetch={false}>
                {t('attention.linkToday')}
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {(data.canCreateProject || data.canCreateExpense) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t('quickActions')}</h2>
          <div className="flex flex-wrap gap-2">
            {data.canCreateExpense ? (
              <Button asChild size="sm">
                <Link href="/expenses/new" prefetch={false}>
                  <Receipt aria-hidden />
                  {tNav('newMenu.expense')}
                </Link>
              </Button>
            ) : null}
            {data.canCreateProject ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/projects/new" prefetch={false}>
                  <Plus aria-hidden />
                  {tNav('newMenu.project')}
                </Link>
              </Button>
            ) : null}
          </div>
        </section>
      )}

      <p className="text-sm">
        <Link href="/reports" className={textNavLinkClassName} prefetch={false}>
          {t('ownerHeadline.reportsLink')}
        </Link>
      </p>
    </div>
  );
}
