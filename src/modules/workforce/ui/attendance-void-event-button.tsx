'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  voidAttendanceEventAction,
  AttendanceActionState,
} from '@/app/[locale]/(app)/workforce/attendance/actions';

interface AttendanceVoidEventButtonProps {
  readonly eventId: string;
  readonly action: typeof voidAttendanceEventAction;
}

export function AttendanceVoidEventButton({ eventId, action }: AttendanceVoidEventButtonProps) {
  const t = useTranslations('workforce.attendance');
  const [state, formAction, pending] = useActionState(action, {} as AttendanceActionState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="dangerGhost" size="sm" loading={pending}>
        {t('corrections.voidEvent')}
      </Button>
      {state.error ? <span className="ms-2 text-xs text-[var(--pf-status-danger-fg)]">{state.error}</span> : null}
    </form>
  );
}
