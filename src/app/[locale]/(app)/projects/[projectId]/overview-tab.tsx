import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProjectFinancialsSnapshot } from '@/modules/financials/ui';
import {
  buildScheduleSummary,
  computeApprovedChangesTotal,
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
    <div className="flex flex-col gap-4">
      <ProjectWorkspaceNav links={workspaceLinks} />

      <ScheduleSummaryPanel summary={schedule} projectId={detail.project.id} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('contractSummary')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {canReadFinancials && detail.currentContractValue ? (
              <>
                {originalEvent ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--pf-text-secondary)]">{t('originalValue')}</span>
                    <MoneyText
                      value={{
                        amount: originalEvent.amount,
                        currency: originalEvent.currency,
                      }}
                    />
                  </div>
                ) : null}
                {approvedChanges ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--pf-text-secondary)]">{t('approvedChanges')}</span>
                    <MoneyText value={approvedChanges} />
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 font-medium">
                  <span>{t('currentValue')}</span>
                  <MoneyText value={detail.currentContractValue} />
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
          <Card>
            <CardHeader>
              <CardTitle>{t('financialSnapshot')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
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
        <Card>
          <CardHeader>
            <CardTitle>{t('valueEvents')}</CardTitle>
          </CardHeader>
          <CardContent>
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
                    <TableCell>
                      {event.reason ??
                        tEvent(event.kind as 'original' | 'change_order' | 'adjustment')}
                    </TableCell>
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
