import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProjectFinancialsSnapshot } from '@/modules/financials/ui';
import {
  buildScheduleSummary,
  computeApprovedChangesTotal,
  contractValueReasonPresentation,
  findOriginalValueEvent,
  type ProjectDetail,
  type ProjectWorkspaceLink,
} from '@/modules/projects';
import { todayInTimeZone } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import type { BusinessDate } from '@/shared/dates';
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
}

export async function OverviewTab({
  detail,
  locale,
  canReadFinancials,
  canEdit,
  workspaceLinks,
  organizationTimezone,
}: OverviewTabProps) {
  const t = await getTranslations('projects.overview');
  const tHistory = await getTranslations('projects.work.contractHistory');
  const tEvent = await getTranslations('projects.overview.eventKind');

  const schedule = buildScheduleSummary({
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

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      <ProjectWorkspaceNav links={workspaceLinks} />

      <ScheduleSummaryPanel summary={schedule} projectId={detail.project.id} />

      <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="min-w-0 max-w-full">
          <CardHeader>
            <CardTitle>{t('contractSummary')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
            {canReadFinancials && detail.currentContractValue ? (
              <>
                {originalEvent ? (
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
                {approvedChanges ? (
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
                  <span className="min-w-0 break-words">{t('currentValue')}</span>
                  <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                    <MoneyText value={detail.currentContractValue} />
                  </span>
                </div>
              </>
            ) : (
              <>
                <p>{t('noContractYet')}</p>
                <CardDescription>{t('noContractHint')}</CardDescription>
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
              <ProjectFinancialsSnapshot projectId={detail.project.id} />
            </CardContent>
          </Card>
        ) : null}
      </section>

      <MilestonesPanel
        projectId={detail.project.id}
        milestones={detail.milestones}
        canEdit={canEdit}
        today={todayInTimeZone(organizationTimezone)}
      />

      {canReadFinancials && detail.contractValueEvents.length > 0 ? (
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
