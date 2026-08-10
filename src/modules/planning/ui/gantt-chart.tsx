'use client';

import type { GanttModel } from '../domain/types';
import type { PlanningMessages } from './messages';

const ROW_H = 36;
const LABEL_W = 180;
const PAD_TOP = 28;
const PAD_BOTTOM = 16;

export interface GanttChartProps {
  readonly model: GanttModel;
  readonly messages: PlanningMessages;
  readonly dir?: 'rtl' | 'ltr';
  /** Highlight transitive predecessors of this work item. */
  readonly focusWorkItemId?: string | null;
  readonly focusedPredecessorIds?: readonly string[];
}

export function GanttChart({
  model,
  messages,
  dir = 'rtl',
  focusWorkItemId = null,
  focusedPredecessorIds = [],
}: GanttChartProps) {
  const chartW = Math.max(480, model.totalDays * 18);
  const height = PAD_TOP + model.bars.length * ROW_H + PAD_BOTTOM;
  const dayW = chartW / model.totalDays;
  const focusPreds = new Set(focusedPredecessorIds);

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]">
      <div className="flex min-w-0" dir={dir}>
        <ul
          className="shrink-0 border-[var(--pf-border-default)] text-start text-sm"
          style={{ width: LABEL_W, paddingTop: PAD_TOP }}
        >
          {model.bars.map((bar) => {
            const highlighted =
              bar.workItemId === focusWorkItemId || focusPreds.has(bar.workItemId);
            return (
              <li
                key={bar.workItemId}
                className={`flex h-9 items-center gap-2 truncate px-3 ${
                  highlighted ? 'bg-[var(--pf-bg-muted)] font-medium' : ''
                }`}
                title={bar.name}
              >
                <span className="truncate">{bar.name}</span>
                {bar.isMilestone ? (
                  <span className="shrink-0 text-xs text-[var(--pf-text-secondary)]">
                    {messages.milestone}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <svg
          role="img"
          aria-label={messages.timeline}
          width={chartW}
          height={height}
          className="grow"
        >
          {/* grid */}
          {Array.from({ length: model.totalDays + 1 }, (_, i) => (
            <line
              key={`g-${i}`}
              x1={i * dayW}
              y1={PAD_TOP}
              x2={i * dayW}
              y2={height - PAD_BOTTOM}
              stroke="var(--pf-border-default)"
              strokeWidth={i % 7 === 0 ? 1.25 : 0.5}
              opacity={i % 7 === 0 ? 0.9 : 0.45}
            />
          ))}

          {/* today */}
          {model.todayOffsetDays != null ? (
            <g>
              <line
                x1={model.todayOffsetDays * dayW + dayW / 2}
                y1={8}
                x2={model.todayOffsetDays * dayW + dayW / 2}
                y2={height - PAD_BOTTOM}
                stroke="var(--pf-status-danger-fg)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={model.todayOffsetDays * dayW + dayW / 2 + 4}
                y={18}
                fill="var(--pf-status-danger-fg)"
                fontSize={11}
              >
                {messages.today}
              </text>
            </g>
          ) : null}

          {/* dependency lines */}
          {model.dependencyEdges.map((edge) => {
            const from = model.bars.find((b) => b.workItemId === edge.predecessorId);
            const to = model.bars.find((b) => b.workItemId === edge.successorId);
            if (!from || !to) return null;
            const fromIdx = model.bars.indexOf(from);
            const toIdx = model.bars.indexOf(to);
            const x1 =
              (from.startOffsetDays + Math.max(from.durationDays, from.isMilestone ? 0.5 : 1)) *
              dayW;
            const y1 = PAD_TOP + fromIdx * ROW_H + ROW_H / 2;
            const x2 = to.startOffsetDays * dayW;
            const y2 = PAD_TOP + toIdx * ROW_H + ROW_H / 2;
            const midX = (x1 + x2) / 2;
            const chainHit =
              focusWorkItemId != null &&
              (edge.successorId === focusWorkItemId ||
                focusPreds.has(edge.predecessorId) ||
                focusPreds.has(edge.successorId));
            return (
              <path
                key={`${edge.predecessorId}->${edge.successorId}`}
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={chainHit ? 'var(--pf-status-info-fg)' : 'var(--pf-text-secondary)'}
                strokeWidth={chainHit ? 2 : 1.25}
                opacity={chainHit ? 1 : 0.55}
                markerEnd="url(#planning-arrow)"
              />
            );
          })}

          <defs>
            <marker
              id="planning-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--pf-text-secondary)" />
            </marker>
          </defs>

          {/* bars */}
          {model.bars.map((bar, idx) => {
            const y = PAD_TOP + idx * ROW_H + 8;
            const highlighted =
              bar.workItemId === focusWorkItemId || focusPreds.has(bar.workItemId);
            if (bar.isMilestone) {
              const cx = bar.startOffsetDays * dayW + dayW / 2;
              const cy = y + 10;
              return (
                <g key={bar.workItemId} opacity={highlighted || !focusWorkItemId ? 1 : 0.45}>
                  <polygon
                    points={`${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}`}
                    fill={bar.overdue ? 'var(--pf-status-danger-fg)' : 'var(--pf-text-primary)'}
                  />
                </g>
              );
            }

            const x = bar.startOffsetDays * dayW;
            const w = Math.max(dayW, bar.durationDays * dayW);
            const progressW = (w * Math.min(100, Math.max(0, bar.progressPercent))) / 100;
            const fill = bar.overdue
              ? 'var(--pf-status-danger-bg)'
              : 'var(--pf-status-info-bg)';
            const stroke = bar.overdue
              ? 'var(--pf-status-danger-fg)'
              : 'var(--pf-status-info-fg)';

            return (
              <g key={bar.workItemId} opacity={highlighted || !focusWorkItemId ? 1 : 0.4}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={20}
                  rx={4}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={highlighted ? 2 : 1}
                />
                <rect
                  x={x}
                  y={y}
                  width={progressW}
                  height={20}
                  rx={4}
                  fill={stroke}
                  opacity={0.35}
                />
                <text
                  x={x + 6}
                  y={y + 14}
                  fontSize={11}
                  fill="var(--pf-text-primary)"
                >{`${Math.round(bar.progressPercent)}%`}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
