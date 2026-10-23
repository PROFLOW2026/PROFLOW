import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent } from '@/components/ui/card';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { compareMoney, subtractMoney, type MoneyValue } from '@/shared/money';
import type { HomeCashForecast } from '../application/get-home-dashboard';

function grossWhenVatExists(net: MoneyValue, gross: MoneyValue): MoneyValue | undefined {
  if (net.currency !== gross.currency) return undefined;
  return compareMoney(net, gross) === 0 ? undefined : gross;
}

export function HomeDashboardCashForecast({
  cashForecast,
  copy,
}: {
  readonly cashForecast: HomeCashForecast;
  readonly copy: {
    readonly title: string;
    readonly hint: string;
    readonly expectedIn: string;
    readonly expectedInHint: string;
    readonly expectedOut: string;
    readonly expectedDifference: string;
    readonly expectedDifferenceHint: string;
    readonly includingVat: string;
    readonly excluded: string;
    readonly openPage: string;
    readonly inHidden: string;
  };
}) {
  const { position } = cashForecast;
  const expectedInNet = position.expectedIn;
  const expectedInGross = position.expectedInGross ?? position.expectedIn;
  const expectedOutNet = position.expectedOutNet ?? position.expectedOut;
  const expectedOutGross = position.expectedOut;
  const differenceNet = subtractMoney(expectedInNet, expectedOutNet);
  const differenceGross = subtractMoney(expectedInGross, expectedOutGross);
  const tiles = [
    {
      key: 'in',
      title: copy.expectedIn,
      money: expectedInNet,
      gross: grossWhenVatExists(expectedInNet, expectedInGross),
      hint: cashForecast.showInflows ? copy.expectedInHint : copy.inHidden,
    },
    {
      key: 'out',
      title: copy.expectedOut,
      money: expectedOutNet,
      gross: grossWhenVatExists(expectedOutNet, expectedOutGross),
      hint: undefined,
    },
    {
      key: 'diff',
      title: copy.expectedDifference,
      money: differenceNet,
      gross: grossWhenVatExists(differenceNet, differenceGross),
      hint: copy.expectedDifferenceHint,
    },
  ];

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
              {tile.gross ? (
                <BillingNetPrimaryDisplay
                  netAmount={tile.money}
                  grossAmount={tile.gross}
                  grossLabel={copy.includingVat}
                  netClassName="text-lg"
                  colorizeNegative
                />
              ) : (
                <p className="min-w-0 max-w-full overflow-x-auto text-lg font-semibold">
                  <MoneyText value={tile.money} colorizeNegative />
                </p>
              )}
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
