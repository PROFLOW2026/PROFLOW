'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NATIVE_CALENDAR_EVENT_KINDS } from '@/modules/calendar/domain/types';
import { createEventAction, type CalendarFormState } from './actions';

export function CalendarEventForm() {
  const t = useTranslations('calendar');
  const [state, action, pending] = useActionState<CalendarFormState, FormData>(createEventAction, {});

  return (
    <form action={action} className="flex max-w-lg flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <Field label={t('fields.title')}>
        {(control) => <Input {...control} name="title" required />}
      </Field>
      <Field label={t('fields.date')}>
        {(control) => <Input {...control} name="eventDate" type="date" required />}
      </Field>
      <Field label={t('fields.kind')}>
        {(control) => (
          <select
            {...control}
            name="eventKind"
            defaultValue="meeting"
            className="h-10 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
          >
            {NATIVE_CALENDAR_EVENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allDay" defaultChecked />
        {t('fields.allDay')}
      </label>
      <Field label={t('fields.notes')}>
        {(control) => <Textarea {...control} name="notes" rows={3} />}
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        {t('actions.save')}
      </Button>
    </form>
  );
}
