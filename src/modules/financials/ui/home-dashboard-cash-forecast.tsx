import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent } from '@/components/ui/card';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { compareMoney, subtractMoney, type MoneyValue } from '@/shared/money';
import type { HomeCashForecast } from '../application/get-home-dashboard';
import type { CashFlowSourceType } from '../domain/cash-flow-forecast';
import type { DashboardKpiDetailContent, DashboardKpiDetailLine } from '../domain/dashboard-kpi-detail';
import type { CashForecastSourceSlice } from '../domain/running-cash-position';
import { DashboardKpiDetailTrigger } from './dashboard-kpi-detail-trigger';
import type { DashboardKpiDetailTriggerCopy } from './dashboard-kpi-detail-trigger';

function grossWhenVatExists(net: MoneyValue, gross: MoneyValue): MoneyValue | undefined {
  if (net.currency !== gross.currency) return undefined;
  return compareMoney(net, gross) === 0 ? undefined : gross;
}

export function HomeDashboardCashForecast({
  cashForecast,
  copy,
  detailCopy,
}: {
  readonly cashForecast: HomeCashForecast;
  readonly copy: {
    readonly title: string;
    readonly hint: string;
    readonly expectedIn: string;
    readonly expectedInHint: string;
    readonly expectedInFormula: string;
    readonly expectedOut: string;
    readonly expectedOutHint: string;
    readonly expectedOutFormula: string;
    readonly expectedDifference: string;
    readonly expectedDifferenceHint: string;
    readonly expectedDifferenceFormula: string;
    readonly sources: Record<CashFlowSourceType, string>;
    readonly includingVat: string;
    readonly excluded: string;
    readonly openPage: string;
    readonly inHidden: string;
  };
  readonly detailCopy: DashboardKpiDetailTriggerCopy;
}) {
  const { position } = cashForecast;
  const expectedInNet = position.expectedIn;
  const expectedInGross = position.expectedInGross ?? position.expectedIn;
  const expectedOutNet = position.expectedOutNet ?? position.expectedOut;
  const expectedOutGross = position.expectedOut;
  const differenceNet = subtractMoney(expectedInNet, expectedOutNet);
  const differenceGross = subtractMoney(expectedInGross, expectedOutGross);
  const inGrossShown = grossWhenVatExists(expectedInNet, expectedInGross);
  const outGrossShown = grossWhenVatExists(expectedOutNet, expectedOutGross);
  const tiles = [
    {
      key: 'in',
      title: copy.expectedIn,
      money: expectedInNet,
      gross: inGrossShown,
      detail: flowDetail({
        title: copy.expectedIn,
        value: expectedInNet,
        gross: inGrossShown,
        grossLabel: copy.includingVat,
        whatIs: cashForecast.showInflows ? copy.expectedInHint : copy.inHidden,
        formula: copy.expectedInFormula,
        sources: position.inflowSources,
        sourceLabels: copy.sources,
        fullScreenLabel: copy.openPage,
      }),
    },
    {
      key: 'out',
      title: copy.expectedOut,
      money: expectedOutNet,
      gross: outGrossShown,
      detail: flowDetail({
        title: copy.expectedOut,
        value: expectedOutNet,
        gross: outGrossShown,
        grossLabel: copy.includingVat,
        whatIs: copy.expectedOutHint,
        formula: copy.expectedOutFormula,
        sources: position.outflowSources,
        sourceLabels: copy.sources,
        fullScreenLabel: copy.openPage,
      }),
    },
    {
      key: 'diff',
      title: copy.expectedDifference,
      money: differenceNet,
      gross: grossWhenVatExists(differenceNet, differenceGross),
      detail: {
        title: copy.expectedDifference,
        value: differenceNet,
        grossValue: grossWhenVatExists(differenceNet, differenceGross),
        grossLabel: copy.includingVat,
        whatIs: copy.expectedDifferenceHint,
        formula: copy.expectedDifferenceFormula,
        breakdown: [
          moneyLine(copy.expectedIn, expectedInNet, inGrossShown, copy.includingVat),
          moneyLine(copy.expectedOut, expectedOutNet, outGrossShown, copy.includingVat),
          moneyLine(copy.expectedDifference, differenceNet, grossWhenVatExists(differenceNet, differenceGross), copy.includingVat),
        ],
        fullScreenHref: '/cash-flow',
        fullScreenLabel: copy.openPage,
      },
    },
  ];
  const sectionNotes = [
    copy.hint,
    position.excludedLaterCount > 0 || position.excludedUndatedCount > 0 ? copy.excluded : '',
  ].filter((note) => note.trim().length > 0);

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold">{copy.title}</h2>
          {sectionNotes.length > 0 ? (
            <DashboardKpiDetailTrigger
              detail={noteDetail(copy.title, sectionNotes)}
              copy={detailCopy}
            />
          ) : null}
        </div>
        <Link href="/cash-flow" className={textNavLinkClassName} prefetch={false}>
          {copy.openPage}
        </Link>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((tile) => (
          <Card key={tile.key} className="min-w-0 max-w-full">
            <CardContent className="flex min-w-0 flex-col gap-1 p-4">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="text-xs text-[var(--pf-text-muted)]">{tile.title}</p>
                {tile.detail ? (
                  <DashboardKpiDetailTrigger detail={tile.detail} copy={detailCopy} />
                ) : null}
              </div>
              {tile.gross ? (
                <BillingNetPrimaryDisplay
                  netAmount={tile.money}
                  grossAmount={tile.gross}
                  grossLabel={copy.includingVat}
                  netClassName="text-lg"
                  colorizeResult={tile.key === 'diff'}
                />
              ) : (
                <p className="min-w-0 max-w-full overflow-x-auto text-lg font-semibold">
                  <MoneyText value={tile.money} colorizeResult={tile.key === 'diff'} />
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function flowDetail(input: {
  readonly title: string;
  readonly value: MoneyValue;
  readonly gross: MoneyValue | undefined;
  readonly grossLabel: string;
  readonly whatIs: string;
  readonly formula: string;
  readonly sources: readonly CashForecastSourceSlice[];
  readonly sourceLabels: Record<CashFlowSourceType, string>;
  readonly fullScreenLabel: string;
}): DashboardKpiDetailContent {
  const sourceLines = input.sources.map((slice) =>
    moneyLine(
      input.sourceLabels[slice.sourceType],
      slice.net,
      grossWhenVatExists(slice.net, slice.gross),
      input.grossLabel,
    ),
  );
  return {
    title: input.title,
    value: input.value,
    grossValue: input.gross,
    grossLabel: input.grossLabel,
    whatIs: input.whatIs,
    formula: input.formula,
    breakdown: [...sourceLines, moneyLine(input.title, input.value, input.gross, input.grossLabel)],
    fullScreenHref: '/cash-flow',
    fullScreenLabel: input.fullScreenLabel,
  };
}

function moneyLine(
  label: string,
  money: MoneyValue,
  gross: MoneyValue | undefined,
  grossLabel: string,
): DashboardKpiDetailLine {
  return {
    label,
    money,
    gross,
    grossLabel: gross ? grossLabel : undefined,
  };
}

function noteDetail(title: string, notes: readonly string[]): DashboardKpiDetailContent {
  return {
    title,
    whatIs: notes.filter((note) => note.trim().length > 0).join('\n\n'),
    formula: '',
    breakdown: [],
  };
}
