import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonText } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { contractValueReasonPresentation } from '@/modules/projects';
import { formatBusinessDate } from '@/shared/dates/format';
import type { BusinessDate } from '@/shared/dates';
import { addMoney, fromNumericString, zeroMoney } from '@/shared/money';
import { loadProjectDetail } from './load-project-detail';

interface OverviewContractHistoryProps {
  projectId: string;
  locale: string;
  currency: string;
}

/**
 * Contract value history — own Suspense boundary so overview chrome/schedule
 * can stream without waiting on the history table flight.
 * Chrome detail is request-cached with layout/page.
 */
export async function OverviewContractHistoryPanel({
  projectId,
  locale,
  currency,
}: OverviewContractHistoryProps) {
  const detail = await loadProjectDetail(projectId, false);
  const events = detail.contractValueEvents;
  if (events.length === 0) return null;

  const t = await getTranslations('projects.overview');
  const tHistory = await getTranslations('projects.work.contractHistory');
  const tEvent = await getTranslations('projects.overview.eventKind');

  const historyRows = events.reduce<
    Array<{
      event: (typeof events)[number];
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
  );
}

export function OverviewContractHistorySuspense(props: OverviewContractHistoryProps) {
  return (
    <Suspense fallback={<SkeletonText lines={4} />}>
      <OverviewContractHistoryPanel {...props} />
    </Suspense>
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
  if (event.kind === 'original' || event.kind === 'change_order' || event.kind === 'adjustment') {
    return tEvent(event.kind);
  }
  return event.reason ?? tEvent('adjustment');
}
