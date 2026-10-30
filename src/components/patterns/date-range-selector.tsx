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
 *  - `labels` – override button / label text (falls back to `common.dateRange` translations).
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';

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
  /** Optional label overrides (falls back to `common.dateRange` translations). */
  labels?: DateRangeSelectorLabels;
  /** Extra CSS classes on the root element. */
  className?: string;
  /** JS weekday that starts the week (0=Sunday … 6=Saturday). Default 0. */
  weekStartDay?: number;
  /** Preset chip keys; defaults to {@link STANDARD_DATE_RANGE_PRESETS}. */
  presets?: readonly Preset[];
  /**
   * When `custom-only`, from/to inputs show only after the user picks Custom or the range
   * does not match a preset (hidden inputs still submit for GET forms).
   */
  dateInputs?: 'always' | 'custom-only';
}

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

export function computePresetRange(
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

/** Owner-approved quick picks: week | month | year (+ precise from/to inputs for custom). */
export const STANDARD_DATE_RANGE_PRESETS = ['thisWeek', 'thisMonth', 'thisYear'] as const;

/** Full legacy preset set — pass explicitly when a screen still needs gradual migration. */
export const LEGACY_DATE_RANGE_PRESETS = [
  'today',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'last30Days',
  'last90Days',
  'thisYear',
  'lastYear',
] as const;

const DEFAULT_PRESETS = STANDARD_DATE_RANGE_PRESETS;

type StandardPreset = (typeof STANDARD_DATE_RANGE_PRESETS)[number];
type LegacyPreset = (typeof LEGACY_DATE_RANGE_PRESETS)[number];
type Preset = StandardPreset | LegacyPreset;

function computePreset(
  preset: string,
  today: string,
  weekStart = 0,
): { from: string; to: string } {
  return computePresetRange(preset, today, weekStart);
}

/** Returns matching preset key when `from`/`to` equal that preset's range. */
export function findMatchingPreset(
  from: string,
  to: string,
  today: string,
  presets: readonly Preset[],
  weekStartDay = 0,
): Preset | null {
  if (!from || !to) return null;
  for (const preset of presets) {
    const range = computePresetRange(preset, today, weekStartDay);
    if (range.from === from && range.to === to) return preset;
  }
  return null;
}

function usesStandardCompactPresets(presets: readonly Preset[]): boolean {
  if (presets.length !== STANDARD_DATE_RANGE_PRESETS.length) return false;
  return STANDARD_DATE_RANGE_PRESETS.every((key, index) => presets[index] === key);
}

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
  presets = DEFAULT_PRESETS,
  dateInputs: dateInputsProp,
}: DateRangeSelectorProps) {
  const t = useTranslations('common.dateRange');
  const labels: Required<DateRangeSelectorLabels> = {
    today: labelsProp?.today ?? t('today'),
    thisWeek: labelsProp?.thisWeek ?? t('thisWeek'),
    thisMonth: labelsProp?.thisMonth ?? t('thisMonth'),
    lastMonth: labelsProp?.lastMonth ?? t('lastMonth'),
    last30Days: labelsProp?.last30Days ?? t('last30Days'),
    last90Days: labelsProp?.last90Days ?? t('last90Days'),
    thisYear: labelsProp?.thisYear ?? t('thisYear'),
    lastYear: labelsProp?.lastYear ?? t('lastYear'),
    from: labelsProp?.from ?? t('from'),
    to: labelsProp?.to ?? t('to'),
    apply: labelsProp?.apply ?? t('apply'),
  };
  const today = todayProp ?? new Date().toISOString().slice(0, 10);
  const dateInputs =
    dateInputsProp ?? (usesStandardCompactPresets(presets) ? 'custom-only' : 'always');
  const customLabel = t('custom');

  // Support both controlled (from/to + onChange) and uncontrolled (defaultFrom/To) modes.
  const isControlled = fromProp !== undefined || toProp !== undefined;
  const [internalFrom, setInternalFrom] = React.useState(defaultFrom);
  const [internalTo, setInternalTo] = React.useState(defaultTo);

  const from = isControlled ? (fromProp ?? '') : internalFrom;
  const to = isControlled ? (toProp ?? '') : internalTo;

  const matchedPreset = findMatchingPreset(from, to, today, presets, weekStartDay);
  const [customRangeOpen, setCustomRangeOpen] = React.useState(
    () => dateInputs === 'always' || findMatchingPreset(defaultFrom, defaultTo, today, presets, weekStartDay) === null,
  );
  const showDateFields = dateInputs === 'always' || customRangeOpen;

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
    const { from: f, to: tVal } = computePreset(preset, today, weekStartDay);
    setFrom(f);
    setTo(tVal);
    if (dateInputs === 'custom-only') {
      setCustomRangeOpen(false);
    }
  }

  function openCustomRange() {
    setCustomRangeOpen(true);
  }

  const presetChipClass = (active: boolean) =>
    cn(
      'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors min-h-9',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pf-focus-ring)]',
      active
        ? 'border-[var(--pf-action-primary)] bg-[var(--pf-accent-soft)] text-[var(--pf-text-brand)]'
        : 'border-[var(--pf-border-default)] bg-transparent hover:bg-[var(--pf-bg-subtle)]',
    );

  return (
    <div className={cn('min-w-0 max-w-full', className)}>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => applyPreset(preset)}
            aria-pressed={matchedPreset === preset && !customRangeOpen}
            className={presetChipClass(matchedPreset === preset && !customRangeOpen)}
          >
            {labels[preset]}
          </button>
        ))}
        {dateInputs === 'custom-only' ? (
          <button
            type="button"
            onClick={openCustomRange}
            aria-pressed={customRangeOpen || matchedPreset === null}
            className={presetChipClass(customRangeOpen || matchedPreset === null)}
          >
            {customLabel}
          </button>
        ) : null}
      </div>

      {showDateFields ? (
        <div className="mt-2 flex min-w-0 flex-wrap items-end gap-2 sm:gap-3">
          <label className="flex min-w-0 w-full flex-col gap-1 text-sm sm:w-auto sm:min-w-[9rem]">
            <span className="text-[var(--pf-text-secondary)]">{labels.from}</span>
            <input
              type="date"
              name={fromName}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-full min-w-0 max-w-full rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pf-focus-ring)]"
              dir="ltr"
            />
          </label>
          <label className="flex min-w-0 w-full flex-col gap-1 text-sm sm:w-auto sm:min-w-[9rem]">
            <span className="text-[var(--pf-text-secondary)]">{labels.to}</span>
            <input
              type="date"
              name={toName}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-full min-w-0 max-w-full rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pf-focus-ring)]"
              dir="ltr"
            />
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name={fromName} value={from} />
          <input type="hidden" name={toName} value={to} />
        </>
      )}
    </div>
  );
}
