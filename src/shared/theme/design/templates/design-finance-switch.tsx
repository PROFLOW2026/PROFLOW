'use client';

import { useState, type ReactNode } from 'react';
import { useMountedDesign } from '../use-mounted-design';

export interface DesignChartPoint {
  readonly month: string;
  readonly collected: string;
  readonly recognized: string;
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
  readonly urgent: readonly DesignUrgentItem[];
  readonly points: readonly DesignChartPoint[];
}

function amount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
          <span>{point.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function Metrics({ snapshot }: { snapshot: DesignFinanceSnapshot }) {
  const cells = (
    [
      ['עלות מוכרת', snapshot.recognized],
      ['נגבה', snapshot.collected],
      ['יתרת חיוב', snapshot.receivable],
      ['חוזה', snapshot.contract],
    ] as const
  ).flatMap(([label, value]) => (value ? [[label, value] as const] : []));
  if (cells.length === 0) return null;
  return (
    <div data-pf-design-landmark="baseline" className="pf-design-baseline">
      {cells.map(([label, value]) => (
        <p key={label}>
          <span>{label}</span>
          <strong>{value ?? '—'}</strong>
        </p>
      ))}
    </div>
  );
}

function Hero({ snapshot }: { snapshot: DesignFinanceSnapshot }) {
  if (!snapshot.margin) return null;
  return (
    <header data-pf-design-landmark="hero" className="pf-design-hero">
      <p>מרווח חוזי · אינו רווח מזומן</p>
      <strong>{snapshot.margin}</strong>
      <span>{snapshot.marginRate ? `${snapshot.marginRate}%` : ''}</span>
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
            <div data-pf-design-landmark="v10-month-detail">
              {snapshot.points.map((point) => (
                <p key={point.month}>
                  <bdi>{point.month}</bdi> {point.collected} / {point.recognized}
                </p>
              ))}
            </div>
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
              {vatOpen ? <p data-pf-design-landmark="v10-vat">{snapshot.marginVat}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
