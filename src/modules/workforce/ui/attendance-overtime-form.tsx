'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type {
  AttendanceActionState,
  updateAttendanceOvertimeAction,
} from '@/app/[locale]/(app)/workforce/attendance/actions';

interface AttendanceOvertimeFormProps {
  readonly dayId: string;
  readonly isOvertime: boolean;
  readonly action: typeof updateAttendanceOvertimeAction;
}

export function AttendanceOvertimeForm({ dayId, isOvertime, action }: AttendanceOvertimeFormProps) {
  const t = useTranslations('workforce.attendance.overtime');
  const [state, formAction, pending] = useActionState(action, {} as AttendanceActionState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <Field label={t('label')}>
        {() => (
          <div className="flex flex-wrap gap-4" role="group">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="isOvertime"
                value="false"
                defaultChecked={!isOvertime}
                disabled={pending}
              />
              {t('no')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="isOvertime"
                value="true"
                defaultChecked={isOvertime}
                disabled={pending}
              />
              {t('yes')}
            </label>
          </div>
        )}
      </Field>
      <input type="hidden" name="dayId" value={dayId} />
      <p className="text-xs text-[var(--pf-text-muted)]">{t('hint')}</p>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('saved')}</Alert> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
