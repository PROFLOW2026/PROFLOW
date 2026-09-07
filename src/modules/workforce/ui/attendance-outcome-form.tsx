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
import type {
  AttendanceOutcomeActionState,
  attendanceOutcomeAction,
} from '@/app/[locale]/(app)/workforce/attendance/outcome-actions';

interface EmployeeOption {
  readonly id: string;
  readonly name: string;
}

type EntryMode = 'single' | 'range';

const ABSENCE_REASONS = ['unpaid_leave', 'vacation', 'sick', 'rest_day', 'other'] as const;

export function AttendanceOutcomeForm({
  action,
  employees,
  defaultDate,
  defaultEmployeeId,
}: {
  readonly action: typeof attendanceOutcomeAction;
  readonly employees: readonly EmployeeOption[];
  readonly defaultDate: string;
  readonly defaultEmployeeId?: string | null;
}) {
  const t = useTranslations('workforce.attendance.outcomes');
  const tCommon = useTranslations('common');
  const initialEmployee =
    defaultEmployeeId && employees.some((row) => row.id === defaultEmployeeId)
      ? defaultEmployeeId
      : (employees[0]?.id ?? '');

  const [employeeId, setEmployeeId] = useState(initialEmployee);
  const [entryMode, setEntryMode] = useState<EntryMode>('single');
  const [workDate, setWorkDate] = useState(defaultDate);
  const [fromDate, setFromDate] = useState(defaultDate);
  const [toDate, setToDate] = useState(defaultDate);
  const [outcome, setOutcome] = useState<'worked' | 'not_worked'>('worked');
  const [absenceReason, setAbsenceReason] = useState<(typeof ABSENCE_REASONS)[number]>('vacation');
  const [absenceCompensation, setAbsenceCompensation] = useState<'paid' | 'unpaid'>('paid');
  const [notes, setNotes] = useState('');
  const [state, formAction, pending] = useActionState(action, {} as AttendanceOutcomeActionState);

  const employeeIndex = useMemo(
    () => employees.findIndex((row) => row.id === employeeId),
    [employeeId, employees],
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <p className="font-medium">{t('title')}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="entryMode" value={entryMode} />
      <input type="hidden" name="outcome" value={outcome} />

      <Field label={t('employee')}>
        {(control) => (
          <div className="flex flex-wrap items-center gap-2">
            {employees.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={employeeIndex <= 0}
                onClick={() => setEmployeeId(employees[Math.max(0, employeeIndex - 1)]!.id)}
              >
                {t('prevEmployee')}
              </Button>
            ) : null}
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id={control.id} className="min-w-[12rem] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {employees.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employees.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={employeeIndex < 0 || employeeIndex >= employees.length - 1}
                onClick={() =>
                  setEmployeeId(employees[Math.min(employees.length - 1, employeeIndex + 1)]!.id)
                }
              >
                {t('nextEmployee')}
              </Button>
            ) : null}
          </div>
        )}
      </Field>

      <Field label={t('entryMode')}>
        {(control) => (
          <Select value={entryMode} onValueChange={(value) => setEntryMode(value as EntryMode)}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">{t('modes.single')}</SelectItem>
              <SelectItem value="range">{t('modes.range')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {entryMode === 'single' ? (
        <Field label={t('workDate')}>
          {(control) => (
            <Input
              id={control.id}
              name="workDate"
              type="date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
            />
          )}
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('fromDate')}>
            {(control) => (
              <Input
                id={control.id}
                name="fromDate"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('toDate')}>
            {(control) => (
              <Input
                id={control.id}
                name="toDate"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            )}
          </Field>
        </div>
      )}

      <Field label={t('dayStatus')}>
        {(control) => (
          <Select
            value={outcome}
            onValueChange={(value) => setOutcome(value as 'worked' | 'not_worked')}
          >
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="worked">{t('status.worked')}</SelectItem>
              <SelectItem value="not_worked">{t('status.notWorked')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {outcome === 'not_worked' ? (
        <>
          <Field label={t('absenceReason')}>
            {(control) => (
              <>
                <Select
                  value={absenceReason}
                  onValueChange={(value) => {
                    const reason = value as (typeof ABSENCE_REASONS)[number];
                    setAbsenceReason(reason);
                    if (reason === 'unpaid_leave') setAbsenceCompensation('unpaid');
                  }}
                >
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {t(`reasons.${reason}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="absenceReason" value={absenceReason} />
              </>
            )}
          </Field>
          <Field label={t('absenceCompensation')}>
            {(control) => (
              <>
                <Select
                  value={absenceCompensation}
                  onValueChange={(value) => setAbsenceCompensation(value as 'paid' | 'unpaid')}
                >
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">{t('compensation.paid')}</SelectItem>
                    <SelectItem value="unpaid">{t('compensation.unpaid')}</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" name="absenceCompensation" value={absenceCompensation} />
              </>
            )}
          </Field>
        </>
      ) : null}

      <Field label={t('notes')}>
        {(control) => (
          <Textarea
            id={control.id}
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
          />
        )}
      </Field>

      <Button type="submit" loading={pending} className="self-start">
        {tCommon('actions.save')}
      </Button>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success">{t('savedCount', { count: state.savedCount ?? 1 })}</Alert>
      ) : null}
    </form>
  );
}
