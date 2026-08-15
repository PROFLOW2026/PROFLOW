'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import type { AvailabilitySignal } from '@/modules/scheduling/domain/types';
import type {
  BoardBookingView,
  BoardDayCell,
  BoardEmployeeRow,
  SchedulingBoard,
} from '@/modules/scheduling/domain/board-view';
import { cancelBookingAction } from './actions';
import { RescheduleBookingForm } from './scheduling-forms';

const SIGNAL_SHAPE: Record<AvailabilitySignal, StatusShape> = {
  available: 'approved',
  partially_booked: 'active',
  fully_booked: 'pending',
  conflict: 'overdue',
  over_capacity: 'onHold',
  unavailable: 'cancelled',
};

const SIGNAL_TONE: Record<AvailabilitySignal, BadgeTone> = {
  available: 'success',
  partially_booked: 'info',
  fully_booked: 'pending',
  conflict: 'danger',
  over_capacity: 'warning',
  unavailable: 'neutral',
};

function formatHours(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 10) / 10);
}

function BookingCard({
  booking,
  canManage,
}: {
  booking: BoardBookingView;
  canManage: boolean;
}) {
  const t = useTranslations('scheduling');
  const format = useFormatter();

  return (
    <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
      <p className="font-medium">{booking.title ?? t(`sources.${booking.source}`)}</p>
      <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
        {t(`sources.${booking.source}`)}
        {booking.readOnly ? ` · ${t('readOnlyHint')}` : ''}
      </p>
      <p className="mt-1 pf-ltr-island text-sm text-[var(--pf-text-secondary)]" dir="ltr">
        {format.dateTime(new Date(booking.startAt), { dateStyle: 'short', timeStyle: 'short' })}
        {' → '}
        {format.dateTime(new Date(booking.endAt), { dateStyle: 'short', timeStyle: 'short' })}
      </p>
      <p className="mt-1 text-sm">{t('hours', { hours: formatHours(booking.plannedHours) })}</p>
      {canManage && booking.id && !booking.readOnly ? (
        <>
          <RescheduleBookingForm
            bookingId={booking.id}
            employeeId={booking.employeeId}
            startAt={booking.startAt}
            endAt={booking.endAt}
            plannedHours={booking.plannedHours}
          />
          <ConfirmAction
            trigger={
              <Button type="button" size="sm" variant="dangerGhost">
                {t('cancelBooking')}
              </Button>
            }
            title={t('cancelConfirmTitle')}
            description={t('cancelConfirmBody')}
            confirmLabel={t('cancelConfirmAction')}
            successMessage={t('cancelled')}
            onConfirm={() => cancelBookingAction(booking.id!)}
          />
        </>
      ) : null}
    </div>
  );
}

function DayCellBody({
  cell,
  canManage,
}: {
  cell: BoardDayCell;
  canManage: boolean;
}) {
  const t = useTranslations('scheduling');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge shape={SIGNAL_SHAPE[cell.signal]} label={t(`signals.${cell.signal}`)} />
        <span className="text-xs text-[var(--pf-text-secondary)]">
          {t('capacity', {
            planned: formatHours(cell.plannedHours),
            capacity: formatHours(cell.capacityHours),
          })}
        </span>
      </div>
      {cell.assignments.map((assignment) => (
        <p key={assignment.assignmentId} className="text-xs text-[var(--pf-text-muted)]">
          {t('assignmentBackground', { project: assignment.projectName })}
        </p>
      ))}
      {cell.unavailability.map((row) => (
        <Badge key={row.id} tone={SIGNAL_TONE.unavailable}>
          {t(`kinds.${row.kind}`)}
        </Badge>
      ))}
      {cell.bookings.map((booking) => (
        <BookingCard key={booking.projectionKey} booking={booking} canManage={canManage} />
      ))}
    </div>
  );
}

function formatDayLabel(date: string, format: ReturnType<typeof useFormatter>): string {
  return format.dateTime(new Date(`${date}T12:00:00`), { weekday: 'short', month: 'short', day: 'numeric' });
}

export function SchedulingBoardView({ board }: { board: SchedulingBoard }) {
  const t = useTranslations('scheduling');
  const format = useFormatter();

  return (
    <>
      <div className="flex flex-col gap-4 md:hidden">
        {board.employees.map((row) => (
          <EmployeeMobileCard key={row.employeeId} row={row} canManage={board.canManage} />
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] border-collapse text-start">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 min-w-40 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start text-sm font-semibold">
                {t('fields.employee')}
              </th>
              {board.days.map((day) => (
                <th
                  key={day}
                  className="min-w-48 border-b border-[var(--pf-border-default)] p-3 text-start text-sm font-semibold"
                >
                  {formatDayLabel(day, format)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.employees.map((row) => (
              <tr key={row.employeeId} className="align-top">
                <th className="sticky start-0 bg-[var(--pf-bg-surface)] p-3 text-start font-medium">
                  {row.employeeName}
                </th>
                {row.days.map((cell) => (
                  <td key={cell.date} className="border-t border-[var(--pf-border-default)] p-3">
                    <DayCellBody cell={cell} canManage={board.canManage} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EmployeeMobileCard({
  row,
  canManage,
}: {
  row: BoardEmployeeRow;
  canManage: boolean;
}) {
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{row.employeeName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {row.days.map((cell) => (
          <div key={cell.date} className="flex flex-col gap-2 border-t border-[var(--pf-border-default)] pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm font-medium">{formatDayLabel(cell.date, format)}</p>
            <DayCellBody cell={cell} canManage={canManage} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
