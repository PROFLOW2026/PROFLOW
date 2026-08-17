import { MoneyText } from '@/components/patterns/money-text';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import type { CashFlowForecast } from '../domain/cash-flow-forecast';
import type { CashFlowBucketKey } from '../domain/cash-flow';

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
}

export function CashFlowForecastView({
  forecast,
  copy,
}: {
  readonly forecast: CashFlowForecast;
  readonly copy: CashFlowForecastViewCopy;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{copy.title}</h2>
          <p className="mt-0.5 break-words text-xs text-[var(--pf-text-secondary)]">{copy.hint}</p>
        </div>

        {forecast.showInflows ? (
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
              {copy.inTitle}
            </p>
            <ul className="mt-2 grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {forecast.periods.map((period) => (
                <li
                  key={`in-${period.key}`}
                  className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3"
                >
                  <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                    {copy.bucketLabel(period.key)}
                  </p>
                  <p className="mt-1 max-w-full overflow-x-auto text-base font-semibold">
                    <MoneyText value={period.expectedIn} />
                  </p>
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {copy.itemCount(period.inCount)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">{copy.inHidden}</p>
        )}

        {forecast.showOutflows ? (
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
              {copy.outTitle}
            </p>
            <ul className="mt-2 grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {forecast.periods.map((period) => (
                <li
                  key={`out-${period.key}`}
                  className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3"
                >
                  <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                    {copy.bucketLabel(period.key)}
                  </p>
                  <p className="mt-1 max-w-full overflow-x-auto text-base font-semibold">
                    <MoneyText value={period.expectedOut} />
                  </p>
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {copy.itemCount(period.outCount)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">{copy.outHidden}</p>
        )}
        <p className="break-words text-xs text-[var(--pf-text-muted)]">{copy.recurringNote}</p>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-sm font-semibold">{copy.drilldownTitle}</h2>
        {forecast.items.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{copy.empty}</p>
        ) : (
          <ul className="flex min-w-0 list-none flex-col gap-2 p-0">
            {forecast.items.map((item) => (
              <li
                key={item.id}
                className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3"
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
                  <p className="shrink-0 text-sm font-semibold">
                    <MoneyText value={item.amount} colorizeNegative />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
