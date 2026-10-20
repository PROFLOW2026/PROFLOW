import { MainAppSection, MainAppSummaryGrid, MainAppTableShell } from '@/components/patterns/main-app';
import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import { MoneyText } from '@/components/patterns/money-text';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { CashFlowForecast } from '../domain/cash-flow-forecast';
import type { CashFlowBucketKey } from '../domain/cash-flow';

const forecastBucketGridClassName =
  'min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6';

export interface CashFlowForecastViewCopy {
  readonly title: string;
  readonly hint: string;
  readonly inTitle: string;
  readonly outTitle: string;
  readonly inHidden: string;
  readonly outHidden: string;
  readonly drilldownTitle: string;
  readonly empty: string;
  readonly recurringNote: string;
  readonly noDate: string;
  readonly bucketLabel: (key: CashFlowBucketKey) => string;
  readonly certaintyLabel: (key: CashFlowForecast['items'][number]['certainty']) => string;
  readonly sourceLabel: (key: CashFlowForecast['items'][number]['sourceType']) => string;
  readonly directionLabel: (key: 'in' | 'out') => string;
  readonly itemCount: (count: number) => string;
  readonly includingVatLabel: string;
}

export function CashFlowForecastView({
  forecast,
  copy,
}: {
  readonly forecast: CashFlowForecast;
  readonly copy: CashFlowForecastViewCopy;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <MainAppSection title={copy.title} description={copy.hint} className="text-start">
        <div className="flex min-w-0 flex-col gap-3">
          {forecast.showInflows ? (
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
                {copy.inTitle}
              </p>
              <MainAppSummaryGrid className={cn('mt-2', forecastBucketGridClassName)}>
                {forecast.periods.map((period) => (
                  <div
                    key={`in-${period.key}`}
                    className="min-w-0 max-w-full rounded-md bg-[var(--pf-bg-muted)] p-2.5 sm:p-3"
                  >
                    <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                      {copy.bucketLabel(period.key)}
                    </p>
                    <div className="mt-1 max-w-full overflow-x-auto text-sm font-semibold sm:text-base">
                      {period.expectedInGross ? (
                        <BillingNetPrimaryDisplay
                          netAmount={period.expectedIn}
                          grossAmount={period.expectedInGross}
                          grossLabel={copy.includingVatLabel}
                          netClassName="text-sm sm:text-base"
                        />
                      ) : (
                        <MoneyText value={period.expectedIn} />
                      )}
                    </div>
                    <p className="text-xs text-[var(--pf-text-secondary)]">
                      {copy.itemCount(period.inCount)}
                    </p>
                  </div>
                ))}
              </MainAppSummaryGrid>
            </div>
          ) : (
            <p className="text-sm text-[var(--pf-text-secondary)]">{copy.inHidden}</p>
          )}

          {forecast.showOutflows ? (
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
                {copy.outTitle}
              </p>
              <MainAppSummaryGrid className={cn('mt-2', forecastBucketGridClassName)}>
                {forecast.periods.map((period) => (
                  <div
                    key={`out-${period.key}`}
                    className="min-w-0 max-w-full rounded-md bg-[var(--pf-bg-muted)] p-2.5 sm:p-3"
                  >
                    <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                      {copy.bucketLabel(period.key)}
                    </p>
                    <p className="mt-1 max-w-full overflow-x-auto text-sm font-semibold sm:text-base">
                      <MoneyText value={period.expectedOut} />
                    </p>
                    <p className="text-xs text-[var(--pf-text-secondary)]">
                      {copy.itemCount(period.outCount)}
                    </p>
                  </div>
                ))}
              </MainAppSummaryGrid>
            </div>
          ) : (
            <p className="text-sm text-[var(--pf-text-secondary)]">{copy.outHidden}</p>
          )}
          <p className="break-words text-xs text-[var(--pf-text-muted)]">{copy.recurringNote}</p>
        </div>
      </MainAppSection>

      <MainAppSection title={copy.drilldownTitle} className="text-start">
        {forecast.items.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{copy.empty}</p>
        ) : (
          <MainAppTableShell>
            <ul className="m-0 flex min-w-0 list-none flex-col gap-0 p-0">
              {forecast.items.map((item) => (
                <li
                  key={item.id}
                  className="min-w-0 border-b border-[var(--pf-border-default)] p-3 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={item.href} className={textNavLinkClassName}>
                        {item.label}
                      </Link>
                      <p className="mt-1 break-words text-xs text-[var(--pf-text-secondary)]">
                        {copy.directionLabel(item.direction)}
                        {' · '}
                        {copy.sourceLabel(item.sourceType)}
                        {' · '}
                        {copy.certaintyLabel(item.certainty)}
                        {' · '}
                        {item.dueDate ? (
                          <time dateTime={item.dueDate} dir="ltr">
                            {item.dueDate}
                          </time>
                        ) : (
                          copy.noDate
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-sm font-semibold">
                      {item.direction === 'in' && item.grossAmount ? (
                        <BillingNetPrimaryDisplay
                          netAmount={item.amount}
                          grossAmount={item.grossAmount}
                          grossLabel={copy.includingVatLabel}
                        />
                      ) : (
                        <MoneyText value={item.amount} colorizeNegative />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </MainAppTableShell>
        )}
      </MainAppSection>
    </div>
  );
}
