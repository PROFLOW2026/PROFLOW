'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
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
  manualAttendanceAction,
  AttendanceActionState,
} from '@/app/[locale]/(app)/workforce/attendance/actions';

interface EmployeeOption {
  readonly id: string;
  readonly name: string;
}

interface AttendanceManualEntryFormProps {
  readonly action: typeof manualAttendanceAction;
  readonly employees: readonly EmployeeOption[];
  readonly defaultDate: string;
}

export function AttendanceManualEntryForm({
  action,
  employees,
  defaultDate,
}: AttendanceManualEntryFormProps) {
  const t = useTranslations('workforce.attendance');
  const tCommon = useTranslations('common');
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '');
  const [eventType, setEventType] = useState('clock_in');
  const [state, formAction, pending] = useActionState(action, {} as AttendanceActionState);

  const defaultOccurredAt = `${defaultDate}T09:00`;

  if (employees.length === 0) {
    return <Alert tone="info">{t('manual.noEmployees')}</Alert>;
  }

  return (
    <form
      action={formAction}
      className="flex max-w-xl flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4"
    >
      <div>
        <h3 className="text-base font-semibold">{t('manual.title')}</h3>
        <p className="text-sm text-[var(--pf-text-muted)]">{t('manual.description')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('manual.saved')}</Alert> : null}

      <Field label={t('manual.employee')} required>
        {(control) => (
          <>
            <input type="hidden" name="employeeId" value={employeeId} />
            <Select value={employeeId} onValueChange={setEmployeeId}>
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
        )}
      </Field>

      <Field label={t('manual.workDate')} required>
        {(control) => (
          <Input
            {...control}
            type="date"
            name="workDate"
            defaultValue={defaultDate}
            required
          />
        )}
      </Field>

      <Field label={t('manual.eventType')} required>
        {(control) => (
          <>
            <input type="hidden" name="eventType" value={eventType} />
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clock_in">{t('eventTypes.clock_in')}</SelectItem>
                <SelectItem value="clock_out">{t('eventTypes.clock_out')}</SelectItem>
                <SelectItem value="break_start">{t('eventTypes.break_start')}</SelectItem>
                <SelectItem value="break_end">{t('eventTypes.break_end')}</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('manual.occurredAt')} required>
        {(control) => (
          <Input
            {...control}
            type="datetime-local"
            name="occurredAtLocal"
            defaultValue={defaultOccurredAt}
            required
          />
        )}
      </Field>

      <Field label={t('manual.notes')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" loading={pending}>
        {t('manual.submit')}
      </Button>
    </form>
  );
}
