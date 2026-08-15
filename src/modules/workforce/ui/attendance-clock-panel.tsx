'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import type {
  clockInAction,
  clockOutAction,
  clockBreakStartAction,
  clockBreakEndAction,
  AttendanceActionState,
} from '@/app/[locale]/(app)/workforce/attendance/actions';
import type { ClockPresenceState } from '@/modules/workforce/domain/attendance';

interface AttendanceClockPanelProps {
  readonly employeeName: string | null;
  readonly workDate: string;
  readonly presence: ClockPresenceState;
  readonly canClockIn: boolean;
  readonly canClockOut: boolean;
  readonly canBreakStart: boolean;
  readonly canBreakEnd: boolean;
  readonly clockInAction: typeof clockInAction;
  readonly clockOutAction: typeof clockOutAction;
  readonly clockBreakStartAction: typeof clockBreakStartAction;
  readonly clockBreakEndAction: typeof clockBreakEndAction;
  readonly linked: boolean;
}

export function AttendanceClockPanel({
  employeeName,
  workDate,
  presence,
  canClockIn,
  canClockOut,
  canBreakStart,
  canBreakEnd,
  clockInAction,
  clockOutAction,
  clockBreakStartAction,
  clockBreakEndAction,
  linked,
}: AttendanceClockPanelProps) {
  const t = useTranslations('workforce.attendance');
  const [inState, inFormAction, inPending] = useActionState(clockInAction, {} as AttendanceActionState);
  const [outState, outFormAction, outPending] = useActionState(
    clockOutAction,
    {} as AttendanceActionState,
  );
  const [breakStartState, breakStartFormAction, breakStartPending] = useActionState(
    clockBreakStartAction,
    {} as AttendanceActionState,
  );
  const [breakEndState, breakEndFormAction, breakEndPending] = useActionState(
    clockBreakEndAction,
    {} as AttendanceActionState,
  );

  const error =
    inState.error ?? outState.error ?? breakStartState.error ?? breakEndState.error;
  const pending = inPending || outPending || breakStartPending || breakEndPending;

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 sm:p-6">
      <div className="text-center">
        <p className="text-sm text-[var(--pf-text-muted)]">{t('clock.today', { date: workDate })}</p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--pf-text-primary)]">
          {employeeName ?? t('clock.noLinkedEmployee')}
        </h2>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
          {t(`presence.${presence}`)}
        </p>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('clock.presenceVsTime')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('disclaimer')}</p>
        <p className="mt-2 text-sm">
          <Link href="/workforce/time" className="font-medium underline">
            {t('clock.logHoursLink')}
          </Link>
        </p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {!linked ? (
        <Alert tone="info">{t('clock.linkRequired')}</Alert>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <form action={inFormAction}>
            <Button
              type="submit"
              disabled={!canClockIn || pending}
              className="h-20 w-full text-xl font-semibold"
              size="lg"
            >
              {t('clock.in')}
            </Button>
          </form>
          <form action={outFormAction}>
            <Button
              type="submit"
              disabled={!canClockOut || pending}
              variant="secondary"
              className="h-20 w-full text-xl font-semibold"
              size="lg"
            >
              {t('clock.out')}
            </Button>
          </form>
          <form action={breakStartFormAction}>
            <Button
              type="submit"
              disabled={!canBreakStart || pending}
              variant="secondary"
              className="h-16 w-full text-base font-semibold"
              size="lg"
            >
              {t('clock.breakStart')}
            </Button>
          </form>
          <form action={breakEndFormAction}>
            <Button
              type="submit"
              disabled={!canBreakEnd || pending}
              variant="secondary"
              className="h-16 w-full text-base font-semibold"
              size="lg"
            >
              {t('clock.breakEnd')}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
