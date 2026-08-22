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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { timeEntryPayloadFromFormData } from '@/modules/offline/domain/payloads';
import { useOfflineAwareFormAction } from '@/modules/offline/ui/use-offline-aware-form-action';
import {
  previewBulkTimeEntries,
  WEEKDAY_WORKDAYS,
  type WeekdayIndex,
} from '@/modules/workforce/domain/bulk-time-expand';
import { Link } from '@/shared/i18n/navigation';
import type { createTimeEntryAction, TimeEntryFormState } from '@/app/[locale]/(app)/workforce/time/actions';

export interface TimeEntryFormOption {
  readonly id: string;
  readonly name: string;
  readonly assignedToProject?: boolean;
}

export interface TimeEntryFormProps {
  readonly action: typeof createTimeEntryAction;
  readonly employees: readonly TimeEntryFormOption[];
  readonly projects: readonly TimeEntryFormOption[];
  readonly timeCodes?: readonly TimeEntryFormOption[];
  readonly defaultEmployeeId: string | null;
  readonly defaultDate: string;
  readonly recentProjectId: string | null;
  readonly assignedEmployeeIds?: readonly string[];
  /** When true, the employee picker is fixed to the linked employee. */
  readonly employeeLocked?: boolean;
  /** When set, submit voids this entry and inserts a replacement. */
  readonly correctsEntryId?: string | null;
  readonly initialHours?: string;
  readonly initialDescription?: string | null;
  readonly initialKind?: 'project' | 'non_project';
  readonly initialTimeCodeId?: string | null;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function TimeEntryForm({
  action,
  employees,
  projects,
  timeCodes = [],
  defaultEmployeeId,
  defaultDate,
  recentProjectId,
  assignedEmployeeIds = [],
  employeeLocked = false,
  correctsEntryId = null,
  initialHours = '',
  initialDescription = null,
  initialKind = 'project',
  initialTimeCodeId = null,
}: TimeEntryFormProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? employees[0]?.id ?? '');
  const [projectId, setProjectId] = useState(recentProjectId ?? projects[0]?.id ?? '');
  const [timeCodeId, setTimeCodeId] = useState(initialTimeCodeId ?? timeCodes[0]?.id ?? '');
  const [kind, setKind] = useState<'project' | 'non_project'>(initialKind);
  const [hours, setHours] = useState(initialHours);
  const [workDate, setWorkDate] = useState(defaultDate);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(correctsEntryId));
  const [fromDate, setFromDate] = useState(defaultDate);
  const [toDate, setToDate] = useState(defaultDate);
  const [weekdays, setWeekdays] = useState<WeekdayIndex[]>([...WEEKDAY_WORKDAYS]);
  const [usePerDayHours, setUsePerDayHours] = useState(false);
  const [perDayHours, setPerDayHours] = useState<Record<string, string>>({});
  const [clientRequestId] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : '',
  );
  const [confirmDailyExcess, setConfirmDailyExcess] = useState(false);

  function formatHoursDisplay(value: string): string {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    const whole = Math.floor(num);
    const mins = Math.round((num - whole) * 60);
    return `${whole}:${String(mins).padStart(2, '0')}`;
  }

  const offlineSuccessState = useMemo<TimeEntryFormState>(() => ({ offlineQueued: true }), []);

  const wrappedAction = useOfflineAwareFormAction<TimeEntryFormState>({
    kind: 'time_entry',
    onlineAction: action,
    buildPayload: timeEntryPayloadFromFormData,
    offlineSuccessState,
    missingOrgError: tOffline('errors.missingOrganization'),
  });

  const [state, formAction, pending] = useActionState(wrappedAction, {});
  const dailyExcess = state.dailyExcessWarning;

  const sortedProjects = useMemo(() => {
    if (!recentProjectId) return projects;
    return [...projects].sort((left, right) => {
      if (left.id === recentProjectId) return -1;
      if (right.id === recentProjectId) return 1;
      return left.name.localeCompare(right.name);
    });
  }, [projects, recentProjectId]);

  const assignedSet = useMemo(() => new Set(assignedEmployeeIds), [assignedEmployeeIds]);
  const teamEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => employee.assignedToProject === true || assignedSet.has(employee.id),
      ),
    [employees, assignedSet],
  );
  const otherEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => employee.assignedToProject !== true && !assignedSet.has(employee.id),
      ),
    [employees, assignedSet],
  );
  const showTeamGroups = teamEmployees.length > 0 && otherEmployees.length > 0;

  const isBulkRange = showAdvanced && fromDate && toDate && fromDate !== toDate;
  const entryMode = correctsEntryId ? 'single' : isBulkRange || (showAdvanced && usePerDayHours) ? 'bulk' : 'single';

  const preview = useMemo(() => {
    if (!showAdvanced || !fromDate || !toDate) return null;
    try {
      const dayHours = usePerDayHours
        ? Object.entries(perDayHours)
            .filter(([, value]) => value.trim())
            .map(([date, value]) => ({ workDate: date, hours: value.trim() }))
        : undefined;
      return previewBulkTimeEntries({
        fromDate,
        toDate,
        hours: hours || '8',
        weekdays,
        dayHours,
      });
    } catch {
      return null;
    }
  }, [showAdvanced, fromDate, toDate, hours, weekdays, usePerDayHours, perDayHours]);

  const dayHoursJson = useMemo(() => {
    if (!usePerDayHours || !preview) return '';
    const rows = preview.days.map((day) => ({
      workDate: day.workDate,
      hours: (perDayHours[day.workDate] ?? day.hours).trim(),
    }));
    return rows.length > 0 ? JSON.stringify(rows) : '';
  }, [usePerDayHours, preview, perDayHours]);

  function toggleWeekday(day: WeekdayIndex) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort(),
    );
  }

  if (employees.length === 0) {
    return <Alert tone="info">{t('time.form.noEmployees')}</Alert>;
  }

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {dailyExcess ? (
        <Alert tone="warning" role="status">
          <p className="font-medium">{t('time.form.dailyExcessTitle')}</p>
          <ul className="mt-2 list-inside list-disc text-sm">
            <li>{t('time.form.dailyExcessRegular', { hours: formatHoursDisplay(dailyExcess.standardHoursPerDay) })}</li>
            <li>{t('time.form.dailyExcessReported', { hours: formatHoursDisplay(dailyExcess.reportedSoFar) })}</li>
            <li>{t('time.form.dailyExcessNew', { hours: formatHoursDisplay(dailyExcess.newHours) })}</li>
            <li>{t('time.form.dailyExcessOver', { hours: formatHoursDisplay(dailyExcess.excessHours) })}</li>
          </ul>
          <p className="mt-2 text-sm">{t('time.form.dailyExcessManagerNote')}</p>
          <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmDailyExcess}
              onChange={(event) => setConfirmDailyExcess(event.target.checked)}
              className="size-4"
            />
            {t('time.form.dailyExcessConfirm')}
          </label>
        </Alert>
      ) : null}
      {correctsEntryId ? (
        <Alert tone="info" role="status">
          {t('time.form.correctionNotice')}
        </Alert>
      ) : null}
      {state.offlineQueued ? (
        <Alert tone="info" role="status">
          {tOffline('forms.draftSaved')}{' '}
          <Link href="/settings/offline-drafts" className="font-medium underline">
            {tOffline('banner.viewDrafts')}
          </Link>
        </Alert>
      ) : null}

      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entryMode" value={entryMode} />
      {correctsEntryId ? <input type="hidden" name="correctsEntryId" value={correctsEntryId} /> : null}
      {clientRequestId ? (
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
      ) : null}
      {confirmDailyExcess ? <input type="hidden" name="confirmDailyExcess" value="on" /> : null}
      {dayHoursJson ? <input type="hidden" name="dayHoursJson" value={dayHoursJson} /> : null}
      {weekdays.map((day) => (
        <input key={day} type="hidden" name="weekdays" value={String(day)} />
      ))}

      <Field label={t('time.form.employee')} required>
        {(control) => (
          <>
            <input type="hidden" name="employeeId" value={employeeId} />
            {employeeLocked ? (
              <Input
                {...control}
                readOnly
                value={employees.find((row) => row.id === employeeId)?.name ?? ''}
              />
            ) : (
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue placeholder={t('time.form.employeePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {showTeamGroups ? (
                  <>
                    <SelectGroup>
                      <SelectLabel>{t('time.form.teamEmployees')}</SelectLabel>
                      {teamEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>{t('time.form.otherEmployees')}</SelectLabel>
                      {otherEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                ) : (
                  employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            )}
          </>
        )}
      </Field>

      <Field label={t('time.form.date')} required>
        {(control) => (
          <Input
            {...control}
            name="workDate"
            type="date"
            value={workDate}
            onChange={(event) => {
              setWorkDate(event.target.value);
              if (!showAdvanced) {
                setFromDate(event.target.value);
                setToDate(event.target.value);
              }
            }}
            required
          />
        )}
      </Field>

      <Field label={t('time.form.hours')} required={!usePerDayHours}>
        {(control) => (
          <Input
            {...control}
            name="hours"
            type="text"
            inputMode="decimal"
            numeric
            placeholder="8"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            required={!usePerDayHours}
            className="text-lg"
          />
        )}
      </Field>

      {kind === 'project' ? (
        <Field label={t('time.form.project')} required>
          {(control) => (
            <>
              <input type="hidden" name="projectId" value={projectId} />
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('time.form.projectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {sortedProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : (
        <Field label={t('time.form.timeCode')} required>
          {(control) => (
            <>
              <input type="hidden" name="timeCodeId" value={timeCodeId} />
              <Select value={timeCodeId} onValueChange={setTimeCodeId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('time.form.timeCodePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {timeCodes.map((code) => (
                    <SelectItem key={code.id} value={code.id}>
                      {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      )}

      <Field label={t('time.form.notes')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Textarea {...control} name="description" rows={2} defaultValue={initialDescription ?? ''} />
        )}
      </Field>

      {!showAdvanced ? (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setShowAdvanced(true)}>
          {t('time.form.advancedOptions')}
        </Button>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('time.form.advancedOptions')}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced(false)}>
              {tCommon('actions.showLess')}
            </Button>
          </div>

          <Field label={t('time.form.kind')}>
            {(control) => (
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as 'project' | 'non_project')}
              >
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">{t('time.form.kindProject')}</SelectItem>
                  <SelectItem value="non_project">{t('time.form.kindNonProject')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('time.form.fromDate')}>
              {(control) => (
                <Input
                  {...control}
                  name="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('time.form.toDate')}>
              {(control) => (
                <Input
                  {...control}
                  name="toDate"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              )}
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('time.form.weekdays')}</legend>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('time.form.weekdaysHint')}</p>
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
                    {t(`time.weekdays.${key}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="inline-flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={usePerDayHours}
              onChange={(event) => setUsePerDayHours(event.target.checked)}
              className="size-4"
            />
            {t('time.form.differentHoursByDay')}
          </label>

          {usePerDayHours && preview ? (
            <div className="overflow-x-auto rounded-md border border-[var(--pf-border-default)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--pf-border-default)] text-start">
                    <th className="px-3 py-2 font-medium">{t('time.columns.date')}</th>
                    <th className="px-3 py-2 font-medium">{t('time.columns.hours')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.days.map((day) => (
                    <tr key={day.workDate} className="border-b border-[var(--pf-border-default)] last:border-0">
                      <td className="px-3 py-2" dir="ltr">
                        {day.workDate}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          name={`dayHours_${day.workDate}`}
                          type="text"
                          inputMode="decimal"
                          numeric
                          value={perDayHours[day.workDate] ?? day.hours}
                          onChange={(event) =>
                            setPerDayHours((current) => ({
                              ...current,
                              [day.workDate]: event.target.value,
                            }))
                          }
                          className="max-w-24"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {preview && preview.entryCount > 0 ? (
            <div className="rounded-md bg-[var(--pf-bg-muted)] p-3 text-sm">
              <p className="font-medium">{t('time.form.bulkPreview')}</p>
              <p className="mt-1 text-[var(--pf-text-secondary)]">
                {t('time.form.bulkPreviewSummary', {
                  count: preview.entryCount,
                  hours: preview.totalHours,
                })}
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs" dir="ltr">
                {preview.days.map((day) => (
                  <li key={day.workDate}>
                    {day.workDate}: {day.hours}h
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <Button type="submit" loading={pending} size="lg" block>
        {correctsEntryId
          ? t('time.form.submitCorrection')
          : entryMode === 'bulk'
            ? t('time.form.submitBulk')
            : t('time.form.submit')}
      </Button>
    </form>
  );
}
