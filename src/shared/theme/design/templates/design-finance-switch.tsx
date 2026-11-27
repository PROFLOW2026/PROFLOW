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
  /** Existing monthly KPI title. This figure is the selected month, not lifetime cost. */
  readonly recognizedTitle: string | null;
  /** Existing monthly explanation, including which month the figure belongs to. */
  readonly recognizedNote: string | null;
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

function Metrics({ snapshot }: { snapshot: DesignFinanceSnapshot }) {
  const cells = (
    [
      [snapshot.recognizedTitle ?? 'עלות מוכרת החודש', snapshot.recognized, snapshot.recognizedNote],
      ['נגבה', snapshot.collected, null],
      ['יתרת חיוב', snapshot.receivable, null],
      ['חוזה', snapshot.contract, null],
    ] as const
  ).flatMap(([label, value, note]) => (value ? [[label, value, note] as const] : []));
  if (cells.length === 0) return null;
  return (
    <div data-pf-design-landmark="baseline" className="pf-design-baseline">
      {cells.map(([label, value, note]) => (
        <p key={label} className="pf-design-metric">
          <span>{label}</span>
          <MoneyFigure value={value} />
          {note ? <span className="pf-design-metric-note">{note}</span> : null}
        </p>
      ))}
    </div>
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

function Hero({ snapshot }: { snapshot: DesignFinanceSnapshot }) {
  if (!snapshot.margin) return null;
  return (
    <header data-pf-design-landmark="hero" className="pf-design-hero">
      <p>מרווח חוזי · אינו רווח מזומן</p>
      <MoneyFigure value={snapshot.margin} />
      {snapshot.marginRate ? (
        <span dir="ltr" className="pf-numeric">
          {formatPercentDisplay(snapshot.marginRate)}
        </span>
      ) : null}
    </header>
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
          <Hero snapshot={snapshot} />
          <Metrics snapshot={snapshot} />
          <div data-pf-design-landmark="v9-chart-full">
            <Chart points={snapshot.points} />
          </div>
        </div>
      ) : null}
      {design === 'v10' ? (
        <div className="pf-design-finance-chrome">
          <div data-pf-design-landmark="v10-glance" className="pf-design-glance">
            <Hero snapshot={snapshot} />
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
            <Metrics snapshot={snapshot} />
          </div>
          <div data-pf-design-landmark="v10-chart-beside" className="pf-design-beside">
            <Chart points={snapshot.points} />
            <MonthList points={snapshot.points} />
          </div>
          {snapshot.marginVat ? (
            <>
              <button
                type="button"
                className="pf-design-vat-toggle"
                aria-expanded={vatOpen}
                onClick={() => setVatOpen((value) => !value)}
              >
                מע״מ וברוטו
              </button>
              {vatOpen ? (
                <p data-pf-design-landmark="v10-vat">
                  <MoneyFigure value={snapshot.marginVat} />
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
