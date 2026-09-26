import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent } from '@/components/ui/card';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import type { HomeCashForecast } from '../application/get-home-dashboard';

export function HomeDashboardCashForecast({
  cashForecast,
  copy,
}: {
  readonly cashForecast: HomeCashForecast;
  readonly copy: {
    readonly title: string;
    readonly hint: string;
    readonly opening: string;
    readonly openingUnset: string;
    readonly openingAsOf: string;
    readonly expectedIn: string;
    readonly expectedOut: string;
    readonly endBalance: string;
    readonly lowest: string;
    readonly excluded: string;
    readonly openPage: string;
    readonly inHidden: string;
  };
}) {
  const { position } = cashForecast;
  const tiles = [
    {
      key: 'opening',
      title: copy.opening,
      money: position.opening,
      hint: cashForecast.openingRecorded
        ? cashForecast.openingAsOf
          ? copy.openingAsOf
          : undefined
        : copy.openingUnset,
    },
    {
      key: 'in',
      title: copy.expectedIn,
      money: position.expectedIn,
      hint: cashForecast.showInflows ? undefined : copy.inHidden,
    },
    {
      key: 'out',
      title: copy.expectedOut,
      money: position.expectedOut,
    },
    {
      key: 'end',
      title: copy.endBalance,
      money: position.endBalance,
    },
    {
      key: 'low',
      title: copy.lowest,
      money: position.lowestBalance,
    },
  ] as const;

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{copy.title}</h2>
          <p className="mt-0.5 break-words text-xs text-[var(--pf-text-muted)]">{copy.hint}</p>
        </div>
        <Link href="/cash-flow" className={textNavLinkClassName} prefetch={false}>
          {copy.openPage}
        </Link>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((tile) => (
          <Card key={tile.key} className="min-w-0 max-w-full">
            <CardContent className="flex min-w-0 flex-col gap-1 p-4">
              <p className="text-xs text-[var(--pf-text-muted)]">{tile.title}</p>
              <p className="min-w-0 max-w-full overflow-x-auto text-lg font-semibold">
                <MoneyText value={tile.money} colorizeNegative />
              </p>
              {'hint' in tile && tile.hint ? (
                <p className="break-words text-xs text-[var(--pf-text-muted)]">{tile.hint}</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {position.excludedLaterCount > 0 || position.excludedUndatedCount > 0 ? (
        <p className="break-words text-xs text-[var(--pf-text-muted)]">{copy.excluded}</p>
      ) : null}
    </section>
  );
}
