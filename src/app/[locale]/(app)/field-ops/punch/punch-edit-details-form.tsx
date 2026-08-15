'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { updatePunchDetailsAction, type FieldOpsFormState } from '../actions';

const NONE = '__none__';

export function PunchEditDetailsForm({
  punchListItemId,
  location,
  dueDate,
  assigneeEmployeeId,
  employees,
}: {
  punchListItemId: string;
  location: string | null;
  dueDate: string | null;
  assigneeEmployeeId: string | null;
  employees: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('fieldOps.createPunch');
  const tCommon = useTranslations('common');
  const [assignee, setAssignee] = useState(assigneeEmployeeId ?? NONE);
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    updatePunchDetailsAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="punchListItemId" value={punchListItemId} />
      <Field label={t('locationLabel')}>
        {(control) => (
          <Input {...control} name="location" defaultValue={location ?? ''} className="min-h-11" />
        )}
      </Field>
      <Field label={t('dueDateLabel')}>
        {(control) => (
          <Input
            {...control}
            type="date"
            name="dueDate"
            defaultValue={dueDate ?? ''}
            className="min-h-11"
          />
        )}
      </Field>
      <Field label={t('assigneeLabel')}>
        {(control) => (
          <>
            <input type="hidden" name="assigneeEmployeeId" value={assignee === NONE ? '' : assignee} />
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id={control.id} className="min-h-11">
                <SelectValue placeholder={t('assigneeNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('assigneeNone')}</SelectItem>
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
      <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={pending}>
        {pending ? tCommon('states.saving') : t('saveDetails')}
      </Button>
      {state.error ? (
        <span role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {state.error}
        </span>
      ) : null}
      {state.success ? (
        <span className="text-sm text-[var(--pf-text-secondary)]">{tCommon('states.saved')}</span>
      ) : null}
    </form>
  );
}
