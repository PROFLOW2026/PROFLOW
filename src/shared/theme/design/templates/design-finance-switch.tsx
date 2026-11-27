'use client';

import { useState, type ReactNode } from 'react';
import { formatPercentDisplay } from '@/shared/number/display';
import { useMountedDesign } from '../use-mounted-design';

export interface DesignChartPoint {
  readonly month: string;
  readonly collected: string;
  readonly recognized: string;
  /** Already formatted for display. The raw fields stay available for bar height only. */
  readonly collectedLabel: string;
  readonly recognizedLabel: string;
}

export interface DesignUrgentItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

export interface DesignFinanceSnapshot {
  readonly margin: string | null;
  readonly marginRate: string | null;
  readonly recognized: string | null;
  readonly collected: string | null;
  readonly receivable: string | null;
  readonly contract: string | null;
  readonly marginVat: string | null;
  readonly recognizedTitle: string | null;
  /** Selected-month collections from the existing organization summary. Not lifetime receipts. */
  readonly monthCollected: string | null;
  readonly monthCollectedLabel: string | null;
  /** Selected month name. Headings only; not a calculation. */
  readonly monthCaption: string | null;
  readonly marginLabel: string | null;
  readonly marginHint: string | null;
  readonly rateLabel: string | null;
  readonly contractLabel: string | null;
  readonly collectedLabel: string | null;
  readonly receivableLabel: string | null;
  readonly urgent: readonly DesignUrgentItem[];
  readonly points: readonly DesignChartPoint[];
}

function amount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthCaption(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return yearMonth;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return yearMonth;
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

function MoneyFigure({ value }: { value: string }) {
  return (
    <strong dir="ltr" className="pf-numeric">
      {value}
    </strong>
  );
}

function Chart({ points }: { points: readonly DesignChartPoint[] }) {
  if (points.length === 0) {
    return <p data-pf-design-chart="empty">אין תנועה חודשית להצגה.</p>;
  }
  const max = Math.max(
    1,
    ...points.flatMap((point) => [amount(point.collected), amount(point.recognized)]),
  );
  return (
    <div data-pf-design-chart="paired" className="pf-design-chart" role="img" aria-label="גבייה מול עלות מוכרת">
      {points.map((point) => (
        <div key={point.month} className="pf-design-chart-col">
          <span className="pf-design-bars">
            <i
              className="pf-design-bar pf-design-bar-collected"
              style={{ height: `${(amount(point.collected) / max) * 100}%` }}
            />
            <i
              className="pf-design-bar pf-design-bar-recognized"
              style={{ height: `${(amount(point.recognized) / max) * 100}%` }}
            />
          </span>
          <span dir="ltr" className="pf-numeric">
            {point.month.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <p className="pf-design-metric">
      <span className="pf-design-metric-label">
        {label}
        {hint ? (
          <button
            type="button"
            className="pf-design-info"
            aria-expanded={open}
            aria-label={`מידע: ${label}`}
            onClick={() => setOpen((current) => !current)}
          >
            מידע
          </button>
        ) : null}
      </span>
      <MoneyFigure value={value} />
      {hint && open ? <span className="pf-design-metric-note">{hint}</span> : null}
    </p>
  );
}

function MetricGrid({
  cells,
}: {
  cells: readonly (readonly [string, string, string | null])[];
}) {
  if (cells.length === 0) return null;
  return (
    <div className="pf-design-metrics">
      {cells.map(([label, value, hint]) => (
        <Metric key={label} label={label} value={value} hint={hint} />
      ))}
    </div>
  );
}

function LifetimeGroup({ snapshot }: { snapshot: DesignFinanceSnapshot }) {
  const cells = (
    [
      [snapshot.marginLabel ?? 'מרווח חוזי בפרויקטים', snapshot.margin, snapshot.marginHint],
      [snapshot.rateLabel ?? 'שיעור מרווח חוזי', snapshot.marginRate ? formatPercentDisplay(snapshot.marginRate) : null, null],
      [snapshot.contractLabel ?? 'שווי פרויקטים', snapshot.contract, null],
      [snapshot.collectedLabel ?? 'התקבל מלקוחות בפועל', snapshot.collected, null],
      [snapshot.receivableLabel ?? 'יתרה לגבייה מלקוחות', snapshot.receivable, null],
    ] as const
  ).flatMap(([label, value, hint]) => (value ? [[label, value, hint] as const] : []));
  if (cells.length === 0) return null;
  return (
    <section data-pf-design-landmark="baseline" className="pf-design-group">
      <h2 className="pf-design-group-title">סיכום מצטבר</h2>
      <MetricGrid cells={cells} />
    </section>
  );
}

function MonthGroup({
  snapshot,
  vatOpen,
  onToggleVat,
}: {
  snapshot: DesignFinanceSnapshot;
  vatOpen: boolean;
  onToggleVat: () => void;
}) {
  const cells = (
    [
      [snapshot.recognizedTitle ?? 'עלות מוכרת החודש', snapshot.recognized, null],
      [snapshot.monthCollectedLabel ?? 'גבייה החודש', snapshot.monthCollected, null],
    ] as const
  ).flatMap(([label, value, hint]) => (value ? [[label, value, hint] as const] : []));
  if (cells.length === 0 && !snapshot.marginVat) return null;
  return (
    <section data-pf-design-landmark="month" className="pf-design-group pf-design-month-group">
      <h2 className="pf-design-group-title">
        <bdi>{snapshot.monthCaption ?? 'החודש הנבחר'}</bdi>
      </h2>
      <MetricGrid cells={cells} />
      {snapshot.marginVat ? (
        <>
          <button
            type="button"
            className="pf-design-vat-toggle"
            aria-expanded={vatOpen}
            onClick={onToggleVat}
          >
            מע״מ וברוטו
          </button>
          {vatOpen ? (
            <p data-pf-design-landmark="v10-vat" className="pf-design-metric">
              <span>כולל מע״מ</span>
              <MoneyFigure value={snapshot.marginVat} />
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function latestDataIndex(points: readonly DesignChartPoint[]): number {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point && (amount(point.collected) !== 0 || amount(point.recognized) !== 0)) return index;
  }
  return Math.max(0, points.length - 1);
}

function MonthArticle({ point }: { point: DesignChartPoint }) {
  return (
    <article className="pf-design-month">
      <h3 className="pf-design-month-title">
        <bdi>{monthCaption(point.month)}</bdi>
      </h3>
      <p className="pf-design-month-row">
        <span>נגבה</span>
        <MoneyFigure value={point.collectedLabel} />
      </p>
      <p className="pf-design-month-row">
        <span>עלות מוכרת</span>
        <MoneyFigure value={point.recognizedLabel} />
      </p>
    </article>
  );
}

function MonthList({ points }: { points: readonly DesignChartPoint[] }) {
  const [open, setOpen] = useState(false);
  if (points.length === 0) return null;
  const latestIndex = latestDataIndex(points);
  const latest = points[latestIndex];
  if (!latest) return null;
  const earlier = points.slice(0, latestIndex);
  return (
    <div data-pf-design-landmark="v10-month-detail" className="pf-design-month-list">
      <MonthArticle point={latest} />
      {earlier.length > 0 ? (
        <button
          type="button"
          className="pf-design-month-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'הסתר את שאר החודשים' : 'הצג את שאר החודשים'}
        </button>
      ) : null}
      {open
        ? earlier.map((point) => <MonthArticle key={point.month} point={point} />)
        : null}
    </div>
  );
}

export function DesignFinanceSwitch({
  current,
  snapshot,
}: {
  current: ReactNode;
  snapshot: DesignFinanceSnapshot;
}) {
  const design = useMountedDesign();
  const [vatOpen, setVatOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const urgent = queueOpen ? snapshot.urgent : snapshot.urgent.slice(0, 3);
  const hidden = Math.max(0, snapshot.urgent.length - 3);

  return (
    <div
      data-pf-design-finance=""
      data-pf-design-variant={design}
      className={
        design === 'v9' ? 'pf-design-finance-v9' : design === 'v10' ? 'pf-design-finance-v10' : undefined
      }
    >
      <div
        data-pf-design-finance-body=""
        data-pf-design-landmark={
          design === 'v9' ? 'v9-table' : design === 'v10' ? 'v10-rest' : undefined
        }
      >
        {current}
      </div>
      {design === 'v9' ? (
        <div className="pf-design-finance-chrome">
          <LifetimeGroup snapshot={snapshot} />
          <MonthGroup
            snapshot={snapshot}
            vatOpen={vatOpen}
            onToggleVat={() => setVatOpen((value) => !value)}
          />
          <div data-pf-design-landmark="v9-chart-full">
            <Chart points={snapshot.points} />
          </div>
        </div>
      ) : null}
      {design === 'v10' ? (
        <div className="pf-design-finance-chrome">
          <div data-pf-design-landmark="v10-glance" className="pf-design-glance">
            <LifetimeGroup snapshot={snapshot} />
            <aside data-pf-design-landmark="v10-urgent">
              <ul>
                {urgent.map((item) => (
                  <li key={item.key}>{item.label}</li>
                ))}
              </ul>
              {hidden > 0 ? (
                <button type="button" onClick={() => setQueueOpen((value) => !value)}>
                  {queueOpen ? 'הסתר' : `כל התור, עוד ${hidden}`}
                </button>
              ) : null}
            </aside>
          </div>
          <MonthGroup
            snapshot={snapshot}
            vatOpen={vatOpen}
            onToggleVat={() => setVatOpen((value) => !value)}
          />
          <div data-pf-design-landmark="v10-chart-beside" className="pf-design-beside">
            <Chart points={snapshot.points} />
            <MonthList points={snapshot.points} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
