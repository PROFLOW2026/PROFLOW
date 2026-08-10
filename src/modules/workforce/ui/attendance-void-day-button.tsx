'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  voidAttendanceDayAction,
  AttendanceActionState,
} from '@/app/[locale]/(app)/workforce/attendance/actions';

interface AttendanceVoidDayButtonProps {
  readonly dayId: string;
  readonly action: typeof voidAttendanceDayAction;
}

export function AttendanceVoidDayButton({ dayId, action }: AttendanceVoidDayButtonProps) {
  const t = useTranslations('workforce.attendance');
  const [state, formAction, pending] = useActionState(action, {} as AttendanceActionState);

  return (
    <form action={formAction}>
      <input type="hidden" name="dayId" value={dayId} />
      <Button type="submit" variant="dangerGhost" size="sm" loading={pending}>
        {t('corrections.voidDay')}
      </Button>
      {state.error ? (
        <p className="mt-1 text-xs text-[var(--pf-status-danger-fg)]">{state.error}</p>
      ) : null}
    </form>
  );
}
