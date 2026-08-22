'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  expandWorkDatesInRange,
  WEEKDAY_WORKDAYS,
  type WeekdayIndex,
} from '@/modules/workforce/domain/bulk-time-expand';
import type {
  AttendanceActionState,
  manualAttendanceAction,
} from '@/app/[locale]/(app)/workforce/attendance/actions';

interface EmployeeOption {
  readonly id: string;
  readonly name: string;
}

interface ProjectOption {
  readonly id: string;
  readonly name: string;
}

type EntryMode = 'single' | 'range';
type WorkScope = 'general' | 'project';
/** 0 = edit form · 1 = first confirm · 2 = final confirm (mutates with overwriteConfirmed) */
type ConfirmStage = 0 | 1 | 2;

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function weekdayOfIsoDate(isoDate: string): WeekdayIndex {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as WeekdayIndex;
}

function overwriteSummaryKey(
  summary: NonNullable<AttendanceActionState['overwriteSummary']>,
): string {
  return [
    summary.employeeId,
    summary.fromDate,
    summary.toDate,
    summary.existingCount,
    summary.clockInTime,
    summary.clockOutTime,
    summary.workScope,
    summary.projectId ?? '',
  ].join('|');
}

interface AttendanceManualEntryFormProps {
  readonly action: typeof manualAttendanceAction;
  readonly employees: readonly EmployeeOption[];
  readonly projects?: readonly ProjectOption[];
  readonly defaultDate: string;
  /** When set, employee is preselected (and locked when employeeLocked). */
  readonly defaultEmployeeId?: string | null;
  readonly employeeLocked?: boolean;
  /** Highlight as primary Owner update flow. */
  readonly emphasize?: boolean;
  /** Initial weekday selection from org work framework (JS 0=Sun … 6=Sat). */
  readonly defaultWeekdays?: readonly number[];
}

export function AttendanceManualEntryForm({
  action,
  employees,
  projects = [],
  defaultDate,
  defaultEmployeeId = null,
  employeeLocked = false,
  emphasize = false,
  defaultWeekdays,
}: AttendanceManualEntryFormProps) {
  const t = useTranslations('workforce.attendance');
  const tCommon = useTranslations('common');
  const tWeekdays = useTranslations('workforce.time.weekdays');
  const initialEmployee =
    defaultEmployeeId && employees.some((row) => row.id === defaultEmployeeId)
      ? defaultEmployeeId
      : (employees[0]?.id ?? '');
  const [employeeId, setEmployeeId] = useState(initialEmployee);
  const [entryMode, setEntryMode] = useState<EntryMode>('single');
  const [workDate, setWorkDate] = useState(defaultDate);
  const [fromDate, setFromDate] = useState(defaultDate);
  const [toDate, setToDate] = useState(defaultDate);
  const [weekdays, setWeekdays] = useState<WeekdayIndex[]>(() => {
    const source =
      defaultWeekdays && defaultWeekdays.length > 0 ? defaultWeekdays : WEEKDAY_WORKDAYS;
    return source.filter((day): day is WeekdayIndex => day >= 0 && day <= 6);
  });
  const [workScope, setWorkScope] = useState<WorkScope>('general');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [clockInTime, setClockInTime] = useState('09:00');
  const [clockOutTime, setClockOutTime] = useState('17:00');
  const [confirmStage, setConfirmStage] = useState<ConfirmStage>(0);
  const [seenOverwriteKey, setSeenOverwriteKey] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(action, {} as AttendanceActionState);

  const lockedEmployee = employees.find((row) => row.id === employeeId);
  const selectedProject = projects.find((row) => row.id === projectId);
  const summary = state.overwriteSummary;

  const dayCount = useMemo(() => {
    if (entryMode === 'single') {
      return workDate ? 1 : 0;
    }
    if (!fromDate || !toDate || weekdays.length === 0) return 0;
    try {
      return expandWorkDatesInRange({ fromDate, toDate, weekdays }).length;
    } catch {
      return 0;
    }
  }, [entryMode, workDate, fromDate, toDate, weekdays]);

  // Adjust confirm stage when the server returns a new overwrite gate / success
  // (React-recommended adjust-state-during-render — avoids setState-in-effect lint).
  const nextOverwriteKey =
    state.needsOverwriteApproval && state.overwriteSummary
      ? overwriteSummaryKey(state.overwriteSummary)
      : null;
  if (nextOverwriteKey && nextOverwriteKey !== seenOverwriteKey) {
    setSeenOverwriteKey(nextOverwriteKey);
    setConfirmStage(1);
  }
  if (state.ok && (confirmStage !== 0 || seenOverwriteKey !== null)) {
    setConfirmStage(0);
    setSeenOverwriteKey(null);
  }

  function resetConfirmFlow() {
    setConfirmStage(0);
    setSeenOverwriteKey(null);
  }

  function toggleWeekday(day: WeekdayIndex) {
    setWeekdays((current) => {
      if (current.includes(day)) {
        const next = current.filter((value) => value !== day);
        return next.length > 0 ? next : current;
      }
      return [...current, day].sort((a, b) => a - b) as WeekdayIndex[];
    });
  }

  if (employees.length === 0) {
    return <Alert tone="info">{t('manual.noEmployees')}</Alert>;
  }

  const effectiveWeekdays =
    entryMode === 'single' && workDate ? [weekdayOfIsoDate(workDate)] : weekdays;

  const fieldsLocked = confirmStage > 0;
  const workLabel =
    (summary?.workScope ?? workScope) === 'project'
      ? (selectedProject?.name ??
          projects.find((row) => row.id === summary?.projectId)?.name ??
          t('manual.workScopeProject'))
      : t('manual.workScopeGeneral');

  return (
    <form
      id="update-attendance"
      action={formAction}
      onSubmit={(event) => {
        // Stage 1 is client-only; never mutate on Enter/submit until stage 2.
        if (confirmStage === 1) {
          event.preventDefault();
        }
      }}
      className={
        emphasize
          ? 'flex max-w-xl flex-col gap-4 rounded-lg border-2 border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)] p-4 sm:p-6'
          : 'flex max-w-xl flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4'
      }
      data-pf-attendance-update
      data-pf-confirm-stage={confirmStage}
    >
      <div>
        <h2 className="text-base font-semibold">{t('manual.updateTitle')}</h2>
        <p className="text-sm text-[var(--pf-text-muted)]">{t('manual.descriptionSimple')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success">{state.message ?? t('manual.saved')}</Alert>
      ) : null}
      {state.warning ? <Alert tone="warning">{state.warning}</Alert> : null}

      <input type="hidden" name="entryMode" value="range" />
      {effectiveWeekdays.map((day) => (
        <input key={`wd-${day}`} type="hidden" name="weekdays" value={day} />
      ))}
      {entryMode === 'single' ? (
        <>
          <input type="hidden" name="fromDate" value={workDate} />
          <input type="hidden" name="toDate" value={workDate} />
        </>
      ) : null}
      {confirmStage === 2 ? (
        <input type="hidden" name="overwriteConfirmed" value="1" />
      ) : null}

      {confirmStage === 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('manual.modeLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
                entryMode === 'single'
                  ? 'border-[var(--pf-border-focus)] bg-[var(--pf-bg-muted)]'
                  : 'border-[var(--pf-border-default)]'
              }`}
              aria-pressed={entryMode === 'single'}
              onClick={() => {
                setEntryMode('single');
                resetConfirmFlow();
              }}
            >
              {t('manual.modeSingle')}
            </button>
            <button
              type="button"
              className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
                entryMode === 'range'
                  ? 'border-[var(--pf-border-focus)] bg-[var(--pf-bg-muted)]'
                  : 'border-[var(--pf-border-default)]'
              }`}
              aria-pressed={entryMode === 'range'}
              onClick={() => {
                setEntryMode('range');
                resetConfirmFlow();
              }}
            >
              {t('manual.modeRange')}
            </button>
          </div>
        </fieldset>
      ) : null}

      <Field label={t('manual.employee')} required>
        {(control) =>
          employeeLocked && lockedEmployee ? (
            <>
              <input type="hidden" name="employeeId" value={employeeId} />
              <Input {...control} readOnly value={lockedEmployee.name} />
            </>
          ) : fieldsLocked ? (
            <>
              <input type="hidden" name="employeeId" value={employeeId} />
              <Input
                {...control}
                readOnly
                value={summary?.employeeName ?? lockedEmployee?.name ?? ''}
              />
            </>
          ) : (
            <>
              <input type="hidden" name="employeeId" value={employeeId} />
              <Select
                value={employeeId}
                onValueChange={(value) => {
                  setEmployeeId(value);
                  resetConfirmFlow();
                }}
              >
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('manual.employeePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )
        }
      </Field>

      {entryMode === 'single' ? (
        <Field label={t('manual.workDate')} required>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={workDate}
              onChange={(event) => {
                setWorkDate(event.target.value);
                resetConfirmFlow();
              }}
              required
              readOnly={fieldsLocked}
            />
          )}
        </Field>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('manual.fromDate')} required>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  name="fromDate"
                  value={fromDate}
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    resetConfirmFlow();
                  }}
                  required
                  readOnly={fieldsLocked}
                />
              )}
            </Field>
            <Field label={t('manual.toDate')} required>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  name="toDate"
                  value={toDate}
                  onChange={(event) => {
                    setToDate(event.target.value);
                    resetConfirmFlow();
                  }}
                  required
                  readOnly={fieldsLocked}
                />
              )}
            </Field>
          </div>

          {confirmStage === 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{t('manual.weekdays')}</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_KEYS.map((key, index) => {
                  const day = index as WeekdayIndex;
                  const checked = weekdays.includes(day);
                  return (
                    <label
                      key={key}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${
                        checked
                          ? 'border-[var(--pf-border-focus)] bg-[var(--pf-bg-muted)]'
                          : 'border-[var(--pf-border-default)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWeekday(day)}
                        className="size-4"
                      />
                      {tWeekdays(key)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('manual.clockInTime')} required>
          {(control) => (
            <Input
              {...control}
              type="time"
              name="clockInTime"
              value={clockInTime}
              onChange={(event) => {
                setClockInTime(event.target.value);
                resetConfirmFlow();
              }}
              required
              readOnly={fieldsLocked}
            />
          )}
        </Field>
        <Field label={t('manual.clockOutTime')} required>
          {(control) => (
            <Input
              {...control}
              type="time"
              name="clockOutTime"
              value={clockOutTime}
              onChange={(event) => {
                setClockOutTime(event.target.value);
                resetConfirmFlow();
              }}
              required
              readOnly={fieldsLocked}
            />
          )}
        </Field>
      </div>

      {confirmStage === 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('manual.workScopeLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
                workScope === 'general'
                  ? 'border-[var(--pf-border-focus)] bg-[var(--pf-bg-muted)]'
                  : 'border-[var(--pf-border-default)]'
              }`}
              aria-pressed={workScope === 'general'}
              onClick={() => {
                setWorkScope('general');
                resetConfirmFlow();
              }}
            >
              {t('manual.workScopeGeneral')}
            </button>
            <button
              type="button"
              className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
                workScope === 'project'
                  ? 'border-[var(--pf-border-focus)] bg-[var(--pf-bg-muted)]'
                  : 'border-[var(--pf-border-default)]'
              }`}
              aria-pressed={workScope === 'project'}
              onClick={() => {
                setWorkScope('project');
                resetConfirmFlow();
              }}
            >
              {t('manual.workScopeProject')}
            </button>
          </div>
          <input type="hidden" name="workScope" value={workScope} />
        </fieldset>
      ) : (
        <input type="hidden" name="workScope" value={summary?.workScope ?? workScope} />
      )}

      {workScope === 'project' || summary?.workScope === 'project' ? (
        <Field label={t('manual.project')} required={confirmStage === 0}>
          {(control) =>
            projects.length === 0 && confirmStage === 0 ? (
              <Alert tone="info">{t('manual.noProjects')}</Alert>
            ) : fieldsLocked ? (
              <>
                <input
                  type="hidden"
                  name="projectId"
                  value={summary?.projectId ?? projectId}
                />
                <Input {...control} readOnly value={workLabel} />
              </>
            ) : (
              <>
                <input type="hidden" name="projectId" value={projectId} />
                <Select
                  value={projectId}
                  onValueChange={(value) => {
                    setProjectId(value);
                    resetConfirmFlow();
                  }}
                >
                  <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                    <SelectValue placeholder={t('manual.projectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )
          }
        </Field>
      ) : null}

      {confirmStage === 0 && dayCount > 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('manual.previewCompact', { count: dayCount })}
        </p>
      ) : null}
      {confirmStage === 0 && dayCount === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('manual.previewEmpty')}</p>
      ) : null}

      {confirmStage === 1 && summary ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)] p-4"
          data-pf-overwrite-step="1"
        >
          <Alert tone="warning">{t('manual.overwriteStep1Title')}</Alert>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--pf-text-secondary)]">
            <li>
              {t('manual.overwriteSummaryEmployee', {
                name: summary.employeeName,
              })}
            </li>
            <li>
              {t('manual.overwriteSummaryPeriod', {
                from: summary.fromDate,
                to: summary.toDate,
              })}
            </li>
            <li>
              {t('manual.overwriteSummaryDays', {
                dayCount: summary.dayCount,
                existingCount: summary.existingCount,
              })}
            </li>
            <li>
              {t('manual.overwriteSummaryHours', {
                clockIn: summary.clockInTime,
                clockOut: summary.clockOutTime,
              })}
            </li>
            <li>
              {t('manual.overwriteSummaryWork', {
                work: workLabel,
              })}
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="lg" onClick={() => setConfirmStage(2)}>
              {t('manual.overwriteContinue')}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={resetConfirmFlow}>
              {tCommon('actions.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {confirmStage === 2 && summary ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-[var(--pf-status-danger-border)] bg-[var(--pf-bg-muted)] p-4"
          data-pf-overwrite-step="2"
        >
          <Alert tone="danger">{t('manual.overwriteStep2Body')}</Alert>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('manual.overwriteSummaryDays', {
              dayCount: summary.dayCount,
              existingCount: summary.existingCount,
            })}
          </p>
        </div>
      ) : null}

      {confirmStage === 0 || confirmStage === 2 ? (
        <Field label={t('manual.notes')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Textarea
              {...control}
              name="notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              readOnly={confirmStage === 2}
            />
          )}
        </Field>
      ) : (
        <input type="hidden" name="notes" value={notes} />
      )}

      {confirmStage === 0 ? (
        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={workScope === 'project' && (projects.length === 0 || !projectId)}
        >
          {t('manual.submitSimple')}
        </Button>
      ) : null}

      {confirmStage === 2 ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" loading={pending} variant="danger">
            {t('manual.overwriteConfirm')}
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={resetConfirmFlow}>
            {tCommon('actions.cancel')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
