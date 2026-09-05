'use client';

/**
 * Reusable date-range picker with preset buttons.
 *
 * Works inside any HTML `<form method="get">`:
 *  - With JS: preset buttons fill the date inputs in-place without a round-trip.
 *  - Without JS: the user fills the date inputs manually and submits the form.
 *
 * Props:
 *  - `today` – server-supplied date string (YYYY-MM-DD) for timezone-accurate presets.
 *    Falls back to `new Date().toISOString().slice(0, 10)` when omitted.
 *  - `fromName` / `toName` – <input name> attributes (defaults: "fromDate" / "toDate").
 *  - `defaultFrom` / `defaultTo` – initial input values.
 *  - `labels` – override button / label text (falls back to hard-coded Hebrew).
 */

import * as React from 'react';

export interface DateRangeSelectorLabels {
  today?: string;
  thisWeek?: string;
  thisMonth?: string;
  lastMonth?: string;
  last30Days?: string;
  last90Days?: string;
  thisYear?: string;
  lastYear?: string;
  from?: string;
  to?: string;
  apply?: string;
}

export interface DateRangeSelectorProps {
  /** Server-side today in the org timezone (YYYY-MM-DD). */
  today?: string;
  /** Initial value for the start-date input (uncontrolled). */
  defaultFrom?: string;
  /** Initial value for the end-date input (uncontrolled). */
  defaultTo?: string;
  /**
   * Controlled value for the start-date input.
   * When provided together with `onFromChange`, the component is fully controlled.
   */
  from?: string;
  /**
   * Controlled value for the end-date input.
   * When provided together with `onToChange`, the component is fully controlled.
   */
  to?: string;
  /** Called when the from-date changes (controlled mode). */
  onFromChange?: (value: string) => void;
  /** Called when the to-date changes (controlled mode). */
  onToChange?: (value: string) => void;
  /** Name attribute for the from-date input (default: "fromDate"). */
  fromName?: string;
  /** Name attribute for the to-date input (default: "toDate"). */
  toName?: string;
  /** Optional label overrides (falls back to Hebrew). */
  labels?: DateRangeSelectorLabels;
  /** Extra CSS classes on the root element. */
  className?: string;
  /** JS weekday that starts the week (0=Sunday … 6=Saturday). Default 0. */
  weekStartDay?: number;
}

const DEFAULT_LABELS: Required<DateRangeSelectorLabels> = {
  today: 'היום',
  thisWeek: 'השבוע',
  thisMonth: 'החודש',
  lastMonth: 'חודש קודם',
  last30Days: '30 יום אחרונים',
  last90Days: '90 יום אחרונים',
  thisYear: 'השנה',
  lastYear: 'שנה קודמת',
  from: 'מ-',
  to: 'עד',
  apply: 'החל',
};

/** Add integer `days` to a YYYY-MM-DD string, returns YYYY-MM-DD. */
function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Return the start of the week for a date. `weekStart` 0=Sunday … 6=Saturday. */
function startOfWeekForPreset(isoDate: string, weekStart = 0): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const dow = d.getUTCDay();
  const start = ((weekStart % 7) + 7) % 7;
  d.setUTCDate(d.getUTCDate() - ((dow - start + 7) % 7));
  return d.toISOString().slice(0, 10);
}

function computePreset(
  preset: string,
  today: string,
  weekStart = 0,
): { from: string; to: string } {
  const [year, month] = today.split('-').map(Number) as [number, number];

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'thisWeek':
      return { from: startOfWeekForPreset(today, weekStart), to: today };
    case 'thisMonth':
      return {
        from: `${year}-${String(month).padStart(2, '0')}-01`,
        to: today,
      };
    case 'lastMonth': {
      const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
      const prevYear = prevMonthDate.getUTCFullYear();
      const prevMonth = prevMonthDate.getUTCMonth() + 1;
      const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
      return {
        from: `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`,
        to: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    case 'last30Days':
      return { from: shiftDate(today, -30), to: today };
    case 'last90Days':
      return { from: shiftDate(today, -90), to: today };
    case 'thisYear':
      return { from: `${year}-01-01`, to: today };
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    default:
      return { from: '', to: '' };
  }
}

const PRESETS = [
  'today',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'last30Days',
  'last90Days',
  'thisYear',
] as const;

type Preset = (typeof PRESETS)[number];

export function DateRangeSelector({
  today: todayProp,
  defaultFrom = '',
  defaultTo = '',
  from: fromProp,
  to: toProp,
  onFromChange,
  onToChange,
  fromName = 'fromDate',
  toName = 'toDate',
  labels: labelsProp,
  className,
  weekStartDay = 0,
}: DateRangeSelectorProps) {
  const labels: Required<DateRangeSelectorLabels> = { ...DEFAULT_LABELS, ...labelsProp };
  const today = todayProp ?? new Date().toISOString().slice(0, 10);

  // Support both controlled (from/to + onChange) and uncontrolled (defaultFrom/To) modes.
  const isControlled = fromProp !== undefined || toProp !== undefined;
  const [internalFrom, setInternalFrom] = React.useState(defaultFrom);
  const [internalTo, setInternalTo] = React.useState(defaultTo);

  const from = isControlled ? (fromProp ?? '') : internalFrom;
  const to = isControlled ? (toProp ?? '') : internalTo;

  function setFrom(value: string) {
    if (isControlled) {
      onFromChange?.(value);
    } else {
      setInternalFrom(value);
    }
  }

  function setTo(value: string) {
    if (isControlled) {
      onToChange?.(value);
    } else {
      setInternalTo(value);
    }
  }

  function applyPreset(preset: Preset) {
    const { from: f, to: t } = computePreset(preset, today, weekStartDay);
    setFrom(f);
    setTo(t);
  }

  return (
    <div className={className}>
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded border border-[var(--pf-border-default)] bg-transparent px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--pf-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pf-focus-ring)]"
          >
            {labels[preset]}
          </button>
        ))}
      </div>

      {/* Date inputs */}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--pf-text-secondary)]">{labels.from}</span>
          <input
            type="date"
            name={fromName}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 min-w-[10rem] rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pf-focus-ring)]"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--pf-text-secondary)]">{labels.to}</span>
          <input
            type="date"
            name={toName}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 min-w-[10rem] rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pf-focus-ring)]"
            dir="ltr"
          />
        </label>
      </div>
    </div>
  );
}
