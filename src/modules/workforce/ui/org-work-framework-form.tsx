'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  bootstrapWorkforceCostingAction,
  saveOrgWorkFrameworkAction,
  type WorkforceFormState,
} from '@/app/[locale]/(app)/workforce/employees/actions';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import Decimal from 'decimal.js';

export interface OrgWorkFrameworkFormProps {
  readonly standardHoursPerDay: string | null;
  readonly workingDaysPerMonth: string | null;
  /** Explicit org work week (0=Sun … 6=Sat). Null → show canonical א׳–ה׳. */
  readonly workWeekdays?: readonly number[] | null;
  /** When true, show setup panel OPEN / prominent. */
  readonly setupRequired: boolean;
  /**
   * Maintenance-only: existing-data open-period costing bootstrap.
   * Requires workforce.cost.manage. Not part of everyday work framework.
   */
  readonly canBootstrapCosting?: boolean;
  /**
   * Compact presentation: when configured, start collapsed with a summary row.
   * Defaults to true (Owner UX). Set false only for dedicated settings surfaces.
   */
  readonly collapseWhenConfigured?: boolean;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function formatWeekdaySummary(
  days: readonly number[],
  labelFor: (key: (typeof WEEKDAY_KEYS)[number]) => string,
): string {
  const selected = days.length > 0 ? days : [0, 1, 2, 3, 4];
  return selected
    .filter((day) => day >= 0 && day <= 6)
    .map((day) => labelFor(WEEKDAY_KEYS[day]!))
    .join(' · ');
}

/**
 * Owner-facing org work framework for attendance / expected day / excess warnings.
 * Configured orgs see a collapsed summary; unconfigured orgs see setup open.
 */
export function OrgWorkFrameworkForm({
  standardHoursPerDay,
  workingDaysPerMonth,
  workWeekdays = null,
  setupRequired,
  canBootstrapCosting = false,
  collapseWhenConfigured = true,
}: OrgWorkFrameworkFormProps) {
  const t = useTranslations('workforce');
  const [hoursPerDay, setHoursPerDay] = useState(standardHoursPerDay ?? '');
  const [daysPerMonth, setDaysPerMonth] = useState(workingDaysPerMonth ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(() =>
    workWeekdays && workWeekdays.length > 0 ? [...workWeekdays] : [0, 1, 2, 3, 4],
  );
  const [expanded, setExpanded] = useState(() => setupRequired || !collapseWhenConfigured);
  const [state, formAction, pending] = useActionState<WorkforceFormState, FormData>(
    saveOrgWorkFrameworkAction,
    {},
  );
  const [bootstrapState, bootstrapAction, bootstrapPending] = useActionState<
    WorkforceFormState,
    FormData
  >(bootstrapWorkforceCostingAction, {});

  const monthlyHours = useMemo(() => {
    const day = hoursPerDay.trim();
    const days = daysPerMonth.trim();
    if (!day || !days || Number(day) <= 0 || Number(days) <= 0) return null;
    try {
      return formatWorkHoursValue(new Decimal(day).times(days).toString());
    } catch {
      return null;
    }
  }, [hoursPerDay, daysPerMonth]);

  const summaryHours = standardHoursPerDay
    ? formatWorkHoursValue(standardHoursPerDay)
    : null;
  const summaryWeek = formatWeekdaySummary(
    workWeekdays && workWeekdays.length > 0 ? workWeekdays : [0, 1, 2, 3, 4],
    (key) => t(`time.weekdays.${key}`),
  );

  const showCollapsedSummary = collapseWhenConfigured && !setupRequired && !expanded;

  const editor = (
    <form
      action={formAction}
      id="org-work-framework"
      className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4 sm:p-6"
    >
      <div className="text-start">
        <h2 className="text-base font-semibold">{t('workFramework.title')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {setupRequired ? t('workFramework.setupRequired') : t('workFramework.description')}
        </p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('workFramework.saved')}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('workFramework.hoursPerDay')} required>
          {(control) => (
            <Input
              {...control}
              name="standardHoursPerDay"
              inputMode="decimal"
              value={hoursPerDay}
              onChange={(event) => setHoursPerDay(event.target.value)}
              required
              dir="ltr"
            />
          )}
        </Field>
        <Field
          label={t('workFramework.daysPerMonth')}
          optionalLabel={t('workFramework.daysPerMonthOptional')}
        >
          {(control) => (
            <Input
              {...control}
              name="workingDaysPerMonth"
              inputMode="decimal"
              value={daysPerMonth}
              onChange={(event) => setDaysPerMonth(event.target.value)}
              dir="ltr"
            />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('workFramework.workWeek')}</legend>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('workFramework.workWeekHint')}</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_KEYS.map((key, day) => {
            const checked = weekdays.includes(day);
            return (
              <label
                key={key}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 text-sm"
              >
                <input
                  type="checkbox"
                  name="workWeekdays"
                  value={String(day)}
                  checked={checked}
                  onChange={() =>
                    setWeekdays((current) =>
                      checked
                        ? current.filter((item) => item !== day)
                        : [...current, day].sort((a, b) => a - b),
                    )
                  }
                  className="size-4"
                />
                {t(`time.weekdays.${key}`)}
              </label>
            );
          })}
        </div>
      </fieldset>

      {monthlyHours ? (
        <p className="text-sm">
          <span className="text-[var(--pf-text-muted)]">{t('workFramework.monthlyHours')}: </span>
          <span className="font-medium" dir="ltr">
            {monthlyHours}
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" loading={pending} disabled={!hoursPerDay.trim() || weekdays.length === 0}>
          {t('workFramework.save')}
        </Button>
        {collapseWhenConfigured && !setupRequired ? (
          <Button type="button" variant="secondary" size="lg" onClick={() => setExpanded(false)}>
            {t('workFramework.collapse')}
          </Button>
        ) : null}
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-4" data-pf-org-work-framework>
      {showCollapsedSummary ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-start">
            <p className="text-sm font-semibold">{t('workFramework.title')}</p>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {summaryHours
                ? t('workFramework.configuredSummary', {
                    hours: summaryHours,
                    weekdays: summaryWeek,
                  })
                : summaryWeek}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded(true)}>
            {t('workFramework.edit')}
          </Button>
        </div>
      ) : (
        editor
      )}

      {canBootstrapCosting ? (
        <details
          className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-3 sm:p-4"
          data-pf-workforce-costing-bootstrap
        >
          <summary className="cursor-pointer text-sm text-[var(--pf-text-secondary)]">
            {t('workFramework.bootstrapSummary')}
          </summary>
          <form action={bootstrapAction} className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-[var(--pf-text-muted)]">
              {t('workFramework.bootstrapDescription')}
            </p>
            {bootstrapState.error ? <Alert tone="danger">{bootstrapState.error}</Alert> : null}
            {bootstrapState.ok ? (
              <Alert tone="success">
                {bootstrapState.message ?? t('workFramework.bootstrapSaved')}
              </Alert>
            ) : null}
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={bootstrapPending}
              className="self-start"
            >
              {t('workFramework.bootstrapAction')}
            </Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
