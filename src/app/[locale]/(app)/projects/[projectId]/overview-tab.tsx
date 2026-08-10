import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonText } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProjectFinancialsSnapshot } from '@/modules/financials/ui';
import {
  buildScheduleSummary,
  computeApprovedChangesTotal,
  contractValueReasonPresentation,
  findOriginalValueEvent,
  hasStoredOpeningReduction,
  resolveDisplayOriginalNet,
  resolveOpeningReductionNet,
  type ProjectDetail,
  type ProjectWorkspaceLink,
} from '@/modules/projects';
import { todayInTimeZone } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import type { BusinessDate } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { addMoney, fromNumericString, zeroMoney } from '@/shared/money';
import { MilestonesPanel } from './milestones-panel';
import { ProjectWorkspaceNav } from './project-workspace-nav';
import { ScheduleSummaryPanel } from './schedule-summary-panel';

interface OverviewTabProps {
  detail: ProjectDetail;
  locale: string;
  canReadFinancials: boolean;
  canEdit: boolean;
  workspaceLinks: readonly ProjectWorkspaceLink[];
  organizationTimezone: string;
  /** Jobs get a slim overview (dates + money links) without schedule/milestones chrome. */
  workKind?: 'project' | 'job';
}

export async function OverviewTab({
  detail,
  locale,
  canReadFinancials,
  canEdit,
  workspaceLinks,
  organizationTimezone,
  workKind = 'project',
}: OverviewTabProps) {
  const t = await getTranslations('projects.overview');
  const tJobs = await getTranslations('jobs');
  const tHistory = await getTranslations('projects.work.contractHistory');
  const tEvent = await getTranslations('projects.overview.eventKind');
  const isJob = workKind === 'job' || detail.project.workKind === 'job';
  const detailsHref = isJob
    ? `/jobs/${detail.project.id}?tab=details`
    : `/projects/${detail.project.id}?tab=details`;

  const schedule = isJob
    ? null
    : buildScheduleSummary({
        project: detail.project,
        workPackages: detail.workPackages,
        milestones: detail.milestones,
        phases: detail.phases,
        today: todayInTimeZone(organizationTimezone),
      });

  const originalEvent = detail.contract
    ? findOriginalValueEvent(detail.contractValueEvents)
    : null;

  const approvedChanges =
    detail.contract && detail.currentContractValue
      ? computeApprovedChangesTotal(detail.contractValueEvents, detail.contract.currency)
      : null;

  const currency = detail.contract?.currency ?? detail.currentContractValue?.currency ?? 'ILS';
  const showEntryBaseline =
    Boolean(detail.contract) && hasStoredOpeningReduction(detail.contract!);
  const displayOriginalNet = detail.contract ? resolveDisplayOriginalNet(detail.contract) : null;
  const openingReductionNet = detail.contract ? resolveOpeningReductionNet(detail.contract) : null;

  const historyRows = detail.contractValueEvents.reduce<
    Array<{
      event: (typeof detail.contractValueEvents)[number];
      previousValue: ReturnType<typeof zeroMoney>;
      newValue: ReturnType<typeof zeroMoney>;
    }>
  >((rows, event) => {
    const previousValue = rows.at(-1)?.newValue ?? zeroMoney(currency);
    const delta = fromNumericString(event.amount, event.currency);
    const newValue = delta ? addMoney(previousValue, delta) : previousValue;
    rows.push({ event, previousValue, newValue });
    return rows;
  }, []);

  const dateRange =
    [detail.project.startDate, detail.project.targetEndDate].filter(Boolean).join(' → ') || '—';

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      <ProjectWorkspaceNav links={workspaceLinks} />

      {isJob ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">{tJobs('overview.datesTitle')}</h2>
            <Link href={detailsHref} className="text-sm hover:underline">
              {tJobs('overview.editDates')}
            </Link>
          </div>
          <p className="mt-2 text-sm tabular-nums" dir="ltr">
            {dateRange}
          </p>
        </section>
      ) : schedule ? (
        <ScheduleSummaryPanel summary={schedule} projectId={detail.project.id} />
      ) : null}

      <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="min-w-0 max-w-full">
          <CardHeader>
            <CardTitle>{isJob ? tJobs('overview.priceSummary') : t('contractSummary')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
            {canReadFinancials && detail.currentContractValue ? (
              <>
                {!isJob && showEntryBaseline && displayOriginalNet ? (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                      {t('displayOriginalValue')}
                    </span>
                    <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                      <MoneyText value={displayOriginalNet} />
                    </span>
                  </div>
                ) : null}
                {!isJob && showEntryBaseline && openingReductionNet ? (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                      {t('openingReductionValue')}
                    </span>
                    <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                      <MoneyText value={openingReductionNet} />
                    </span>
                  </div>
                ) : null}
                {!isJob && originalEvent ? (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                      {t('originalValue')}
                    </span>
                    <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                      <MoneyText
                        value={{
                          amount: originalEvent.amount,
                          currency: originalEvent.currency,
                        }}
                      />
                    </span>
                  </div>
                ) : null}
                {!isJob && approvedChanges ? (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                      {t('approvedChanges')}
                    </span>
                    <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                      <MoneyText value={approvedChanges} />
                    </span>
                  </div>
                ) : null}
                <div className="flex min-w-0 justify-between gap-2 font-medium">
                  <span className="min-w-0 break-words">
                    {isJob ? tJobs('pricing.priceLabel') : t('currentValue')}
                  </span>
                  <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                    <MoneyText value={detail.currentContractValue} />
                  </span>
                </div>
              </>
            ) : (
              <>
                <p>{isJob ? tJobs('pricing.priceNotSet') : t('noContractYet')}</p>
                <CardDescription>
                  {isJob ? tJobs('overview.noPriceHint') : t('noContractHint')}
                </CardDescription>
              </>
            )}
          </CardContent>
        </Card>

        {canReadFinancials ? (
          <Card className="min-w-0 max-w-full">
            <CardHeader>
              <CardTitle>{t('financialSnapshot')}</CardTitle>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
              <Suspense fallback={<SkeletonText lines={3} />}>
                <ProjectFinancialsSnapshot projectId={detail.project.id} />
              </Suspense>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {!isJob ? (
        <MilestonesPanel
          projectId={detail.project.id}
          milestones={detail.milestones}
          canEdit={canEdit}
          today={todayInTimeZone(organizationTimezone)}
        />
      ) : null}

      {canReadFinancials && !isJob && detail.contractValueEvents.length > 0 ? (
        <Card className="min-w-0 max-w-full overflow-hidden">
          <CardHeader>
            <CardTitle>{t('valueEvents')}</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <ResponsiveTable
              items={historyRows}
              getRowKey={(row) => row.event.id}
              desktop={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead numeric>{tHistory('previousValue')}</TableHead>
                      <TableHead numeric>{tHistory('newValue')}</TableHead>
                      <TableHead>{tHistory('reason')}</TableHead>
                      <TableHead>{tHistory('changedAt')}</TableHead>
                      <TableHead>{tHistory('changedBy')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.map(({ event, previousValue, newValue }) => (
                      <TableRow key={event.id}>
                        <TableCell numeric>
                          <MoneyText value={previousValue} compact />
                        </TableCell>
                        <TableCell numeric>
                          <MoneyText value={newValue} compact />
                        </TableCell>
                        <TableCell>{formatContractReason(event, tHistory, tEvent)}</TableCell>
                        <TableCell>
                          {formatBusinessDate(event.effectiveDate as BusinessDate, locale)}
                        </TableCell>
                        <TableCell>
                          {event.actorDisplayName ??
                            (event.actorEmail ? (
                              <span dir="ltr">{event.actorEmail}</span>
                            ) : (
                              tHistory('unknownActor')
                            ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              renderMobileCard={({ event, previousValue, newValue }) => (
                <div className="min-w-0 max-w-full rounded-md border border-[var(--pf-border-default)] p-3 text-start">
                  <p className="min-w-0 break-words text-sm font-medium">
                    {formatContractReason(event, tHistory, tEvent)}
                  </p>
                  <dl className="mt-2 grid min-w-0 gap-1.5 text-sm">
                    <div className="flex min-w-0 justify-between gap-3">
                      <dt className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                        {tHistory('previousValue')}
                      </dt>
                      <dd className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                        <MoneyText value={previousValue} compact />
                      </dd>
                    </div>
                    <div className="flex min-w-0 justify-between gap-3">
                      <dt className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                        {tHistory('newValue')}
                      </dt>
                      <dd className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                        <MoneyText value={newValue} compact />
                      </dd>
                    </div>
                    <div className="flex min-w-0 justify-between gap-3">
                      <dt className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                        {tHistory('changedAt')}
                      </dt>
                      <dd className="min-w-0 shrink-0 text-end" dir="ltr">
                        {formatBusinessDate(event.effectiveDate as BusinessDate, locale)}
                      </dd>
                    </div>
                    <div className="flex min-w-0 justify-between gap-3">
                      <dt className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                        {tHistory('changedBy')}
                      </dt>
                      <dd className="min-w-0 max-w-[55%] break-words text-end">
                        {event.actorDisplayName ??
                          (event.actorEmail ? (
                            <span dir="ltr">{event.actorEmail}</span>
                          ) : (
                            tHistory('unknownActor')
                          ))}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function formatContractReason(
  event: { reason: string | null; kind: string },
  tHistory: Awaited<ReturnType<typeof getTranslations<'projects.work.contractHistory'>>>,
  tEvent: Awaited<ReturnType<typeof getTranslations<'projects.overview.eventKind'>>>,
): string {
  const presentation = contractValueReasonPresentation(event.reason);
  if (presentation?.key === 'changeOrder') {
    return tHistory('reasons.changeOrder', presentation.values);
  }
  if (presentation) {
    return tHistory(`reasons.${presentation.key}`);
  }
  // Prefer translated kind labels over unmapped English system reasons.
  if (event.kind === 'original' || event.kind === 'change_order' || event.kind === 'adjustment') {
    return tEvent(event.kind);
  }
  return event.reason ?? tEvent('adjustment');
}
