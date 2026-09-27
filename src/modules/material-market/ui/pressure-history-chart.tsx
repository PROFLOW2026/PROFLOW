'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface HistoryPoint {
  date: string;
  score: number;
}

type HistoryRange = '12' | '24' | 'all';
/** Chart layout uses only 12 vs 24 paths; "all" aliases to the 24 path. */
type LayoutRange = '12' | '24';
type XLayoutMode = 'chronological' | 'observation';

interface PressureHistoryChartProps {
  data: HistoryPoint[];
  ariaLabel: string;
  range: HistoryRange;
  domainStart?: string;
  domainEnd?: string;
}

interface ParsedPoint {
  date: string;
  score: number;
  time: number;
}

interface ChartPoint extends ParsedPoint {
  x: number;
  y: number;
  index: number;
}

const CHART_WIDTH = 720;
const CHART_HEIGHT_DEFAULT = 220;
const CHART_HEIGHT_SINGLE = 112;
const MARGIN = { top: 10, right: 10, bottom: 30, left: 38 };

function toLayoutRange(range: HistoryRange): LayoutRange {
  return range === '12' ? '12' : '24';
}

function parsePoints(data: HistoryPoint[]): ParsedPoint[] {
  return [...data]
    .filter((d) => {
      if (!d.date || d.date.length < 7) return false;
      if (!Number.isFinite(d.score)) return false;
      const time = new Date(`${d.date.slice(0, 10)}T00:00:00`).getTime();
      return Number.isFinite(time);
    })
    .map((d) => ({
      date: d.date,
      score: d.score,
      time: new Date(`${d.date.slice(0, 10)}T00:00:00`).getTime(),
    }))
    .sort((a, b) => a.time - b.time);
}

function computeNiceTicks(min: number, max: number, targetCount = 4): { min: number; max: number; ticks: number[] } {
  if (min === max) {
    const pad = Math.max(3, min * 0.05);
    return {
      min: Math.round(min - pad),
      max: Math.round(max + pad),
      ticks: [Math.round(min - pad), Math.round(min), Math.round(max + pad)],
    };
  }

  const range = max - min;
  const rawStep = range / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  let step: number;
  if (residual <= 1) step = magnitude;
  else if (residual <= 2) step = 2 * magnitude;
  else if (residual <= 5) step = 5 * magnitude;
  else step = 10 * magnitude;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.001; v += step) {
    ticks.push(Math.round(v * 10) / 10);
  }
  return { min: niceMin, max: niceMax, ticks };
}

function computeYDomain(scores: number[]) {
  const rawMin = Math.min(...scores);
  const rawMax = Math.max(...scores);
  const spread = rawMax - rawMin;
  const padding = spread > 0 ? Math.max(2, spread * 0.12) : Math.max(4, rawMin * 0.06);

  let paddedMin = rawMin - padding;
  let paddedMax = rawMax + padding;

  if (rawMin >= 15) paddedMin = Math.max(paddedMin, rawMin - padding);
  else paddedMin = Math.max(0, paddedMin);

  if (rawMax <= 85) paddedMax = Math.min(paddedMax, rawMax + padding);
  else paddedMax = Math.min(100, paddedMax);

  return computeNiceTicks(paddedMin, paddedMax, 4);
}

function resolveXLayout(
  layoutRange: LayoutRange,
  pointCount: number,
  dataSpanMs: number,
  domainSpanMs: number,
): XLayoutMode {
  if (pointCount <= 1) return 'observation';

  const calendarDensity = domainSpanMs > 0 ? dataSpanMs / domainSpanMs : 1;

  if (layoutRange === '12') {
    if (pointCount <= 3 || calendarDensity < 0.12) return 'observation';
    return 'chronological';
  }

  if (pointCount <= 3 || calendarDensity < 0.12) return 'observation';
  return 'chronological';
}

function resolveChronologicalDomain(
  filterMinTime: number,
  filterMaxTime: number,
): { min: number; max: number } {
  return { min: filterMinTime, max: filterMaxTime };
}

function pickObservationLabelIndices(count: number, maxLabels: number): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const indices = new Set<number>([0, count - 1]);
  const step = (count - 1) / (maxLabels - 1);
  for (let i = 1; i < maxLabels - 1; i += 1) {
    indices.add(Math.round(i * step));
  }
  return [...indices].sort((a, b) => a - b);
}

function pickChronologicalTicks(minTime: number, maxTime: number, maxLabels: number): number[] {
  if (maxTime <= minTime) return [minTime];
  const count = Math.min(maxLabels, 5);
  const step = (maxTime - minTime) / Math.max(count - 1, 1);
  return Array.from({ length: count }, (_, i) => minTime + step * i);
}

export function PressureHistoryChart({
  data,
  ariaLabel,
  range,
  domainStart,
  domainEnd,
}: PressureHistoryChartProps) {
  const t = useTranslations('materialMarket');
  const locale = useLocale();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const layoutRange = toLayoutRange(range);

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }),
    [locale],
  );
  const tooltipDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }),
    [locale],
  );

  const points = useMemo(() => parsePoints(data), [data]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    console.debug('[PressureHistoryChart]', {
      range,
      layoutRange,
      inputPoints: data.length,
      renderedPoints: points.length,
    });
  }, [data.length, layoutRange, points.length, range]);

  const chart = useMemo(() => {
    if (points.length === 0) return null;

    const isSingle = points.length === 1;
    const chartHeight = isSingle ? CHART_HEIGHT_SINGLE : CHART_HEIGHT_DEFAULT;
    const plotLeft = MARGIN.left;
    const plotTop = MARGIN.top;
    const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
    const plotHeight = chartHeight - MARGIN.top - MARGIN.bottom;
    const plotBottom = plotTop + plotHeight;

    const yDomain = computeYDomain(points.map((p) => p.score));

    const firstPoint = points[0]!;
    const lastPoint = points[points.length - 1]!;
    const dataMinTime = firstPoint.time;
    const dataMaxTime = lastPoint.time;
    const filterMinTime = domainStart
      ? new Date(`${domainStart.slice(0, 10)}T00:00:00`).getTime()
      : dataMinTime;
    const filterMaxTime = domainEnd
      ? new Date(`${domainEnd.slice(0, 10)}T00:00:00`).getTime()
      : dataMaxTime;
    const dataSpanMs = Math.max(dataMaxTime - dataMinTime, 1);
    const domainSpanMs = Math.max(filterMaxTime - filterMinTime, 1);

    const xLayout = resolveXLayout(layoutRange, points.length, dataSpanMs, domainSpanMs);
    const chronoDomain = resolveChronologicalDomain(filterMinTime, filterMaxTime);

    const xAtChronological = (time: number) => {
      const span = Math.max(chronoDomain.max - chronoDomain.min, 1);
      const clamped = Math.min(Math.max(time, chronoDomain.min), chronoDomain.max);
      return plotLeft + ((clamped - chronoDomain.min) / span) * plotWidth;
    };

    const xAtObservation = (index: number) => {
      if (points.length === 1) return plotLeft + plotWidth / 2;
      const edgePad = plotWidth * 0.04;
      const usable = plotWidth - edgePad * 2;
      return plotLeft + edgePad + (index / (points.length - 1)) * usable;
    };

    const yAt = (score: number) =>
      plotTop + plotHeight - ((score - yDomain.min) / (yDomain.max - yDomain.min || 1)) * plotHeight;

    const coords: ChartPoint[] = points.map((p, index) => ({
      ...p,
      index,
      x: xLayout === 'observation' ? xAtObservation(index) : xAtChronological(p.time),
      y: yAt(p.score),
    }));

    const xLabelIndices =
      xLayout === 'observation'
        ? pickObservationLabelIndices(points.length, Math.min(5, points.length))
        : [];

    const xTicksChronological = pickChronologicalTicks(chronoDomain.min, chronoDomain.max, 5);

    const isDense = points.length > 18;
    const latestIndex = coords.length - 1;
    const neutralY =
      !isSingle && yDomain.min <= 50 && yDomain.max >= 50 ? yAt(50) : null;

    return {
      points: coords,
      yDomain,
      xLayout,
      xLabelIndices,
      xTicksChronological,
      plotLeft,
      plotTop,
      plotWidth,
      plotHeight,
      plotBottom,
      yAt,
      xAtChronological,
      isDense,
      latestIndex,
      neutralY,
      isSingle,
      chartHeight,
    };
  }, [domainEnd, domainStart, layoutRange, points]);

  if (!chart) {
    return (
      <div className="flex h-[112px] items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
        —
      </div>
    );
  }

  const {
    points: coords,
    yDomain,
    xLayout,
    xLabelIndices,
    xTicksChronological,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    plotBottom,
    yAt,
    xAtChronological,
    isDense,
    latestIndex,
    neutralY,
    isSingle,
    chartHeight,
  } = chart;

  const hovered = hoveredIndex != null ? coords[hoveredIndex] : null;
  const single = isSingle ? coords[0] : null;

  if (single) {
    return (
      <div className="w-full min-w-0" dir="ltr">
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted/20 px-4 py-4">
          <p className="text-xs text-muted-foreground">
            {tooltipDateFormatter.format(new Date(single.time))}
          </p>
          <p className="text-3xl font-semibold tabular-nums text-primary">{Math.round(single.score)}</p>
          <p className="text-center text-xs text-muted-foreground">{t('historyInsufficientTrend')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0" dir="ltr">
      <figure className="relative w-full">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
          className="block w-full max-w-full"
          style={{ height: chartHeight }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={ariaLabel}
        >
          {yDomain.ticks.map((tick) => {
            const y = yAt(tick);
            return (
              <g key={tick}>
                <line
                  x1={plotLeft}
                  y1={y}
                  x2={plotLeft + plotWidth}
                  y2={y}
                  className="stroke-border/60"
                  strokeWidth={1}
                />
                <text
                  x={plotLeft - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {Math.round(tick)}
                </text>
              </g>
            );
          })}

          {xLayout === 'observation'
            ? xLabelIndices.map((index) => {
                const p = coords[index];
                if (!p) return null;
                return (
                  <g key={`${p.date}-${index}`}>
                    <line
                      x1={p.x}
                      y1={plotTop}
                      x2={p.x}
                      y2={plotBottom}
                      className="stroke-border/40"
                      strokeWidth={1}
                    />
                    <text
                      x={p.x}
                      y={plotBottom + 16}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {monthFormatter.format(new Date(p.time))}
                    </text>
                  </g>
                );
              })
            : xTicksChronological.map((time) => {
                const x = xAtChronological(time);
                return (
                  <g key={time}>
                    <line
                      x1={x}
                      y1={plotTop}
                      x2={x}
                      y2={plotBottom}
                      className="stroke-border/40"
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={plotBottom + 16}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {monthFormatter.format(new Date(time))}
                    </text>
                  </g>
                );
              })}

          <rect
            x={plotLeft}
            y={plotTop}
            width={plotWidth}
            height={plotHeight}
            fill="none"
            className="stroke-border/80"
            strokeWidth={1}
          />

          {neutralY != null && (
            <line
              x1={plotLeft}
              y1={neutralY}
              x2={plotLeft + plotWidth}
              y2={neutralY}
              className="stroke-muted-foreground/35"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}

          {coords.length > 1 && (
            <polyline
              points={coords.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
              fill="none"
              className="stroke-primary"
              strokeWidth={2.5}
              strokeOpacity={1}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {coords.map((p, i) => {
            const isLatest = i === latestIndex;
            const isHovered = i === hoveredIndex;
            const isVeryDense = coords.length > 24;
            const showMarker = true;
            const radius = isLatest ? 4.5 : isHovered ? 3.5 : isVeryDense ? 1.75 : isDense ? 2.25 : 3;

            return (
              <g key={`${p.date}-${i}`}>
                {showMarker && (
                  <>
                    {isLatest && (
                      <circle cx={p.x} cy={p.y} r={radius + 3} className="fill-primary/15" />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={radius}
                      className={
                        isLatest
                          ? 'fill-primary stroke-background'
                          : isHovered
                            ? 'fill-primary'
                            : 'fill-primary/85'
                      }
                      strokeWidth={isLatest ? 2 : 0}
                    />
                  </>
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12}
                  fill="transparent"
                  className="cursor-default"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(i)}
                  onBlur={() => setHoveredIndex(null)}
                  tabIndex={0}
                  role="presentation"
                />
              </g>
            );
          })}

          {hovered && (
            <line
              x1={hovered.x}
              y1={plotTop}
              x2={hovered.x}
              y2={plotBottom}
              className="stroke-primary/25"
              strokeWidth={1}
            />
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${(hovered.x / CHART_WIDTH) * 100}%`,
              top: `${((hovered.y - 32) / chartHeight) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="whitespace-nowrap text-muted-foreground">
              {tooltipDateFormatter.format(new Date(hovered.time))}
            </p>
            <p className="whitespace-nowrap font-medium tabular-nums">{Math.round(hovered.score)}</p>
          </div>
        )}
      </figure>
    </div>
  );
}
