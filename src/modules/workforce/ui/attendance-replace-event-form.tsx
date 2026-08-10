'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  replaceAttendanceEventAction,
  AttendanceActionState,
} from '@/app/[locale]/(app)/workforce/attendance/actions';

interface AttendanceReplaceEventFormProps {
  readonly eventId: string;
  readonly defaultType: string;
  readonly defaultOccurredAt: string;
  readonly action: typeof replaceAttendanceEventAction;
}

export function AttendanceReplaceEventForm({
  eventId,
  defaultType,
  defaultOccurredAt,
  action,
}: AttendanceReplaceEventFormProps) {
  const t = useTranslations('workforce.attendance');
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState(defaultType);
  const [state, formAction, pending] = useActionState(action, {} as AttendanceActionState);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t('corrections.replace')}
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-[var(--pf-border-default)] p-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="eventType" value={eventType} />
      <Select value={eventType} onValueChange={setEventType}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="clock_in">{t('eventTypes.clock_in')}</SelectItem>
          <SelectItem value="clock_out">{t('eventTypes.clock_out')}</SelectItem>
          <SelectItem value="break_start">{t('eventTypes.break_start')}</SelectItem>
          <SelectItem value="break_end">{t('eventTypes.break_end')}</SelectItem>
        </SelectContent>
      </Select>
      <Input type="datetime-local" name="occurredAtLocal" defaultValue={defaultOccurredAt} />
      <Input name="notes" placeholder={t('corrections.replaceNotes')} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {t('corrections.saveReplace')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('corrections.cancel')}
        </Button>
      </div>
      {state.error ? <p className="text-xs text-[var(--pf-status-danger-fg)]">{state.error}</p> : null}
    </form>
  );
}
