import { getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AttendanceDayDetail } from '@/modules/workforce';
import {
  replaceAttendanceEventAction,
  voidAttendanceDayAction,
  voidAttendanceEventAction,
} from '@/app/[locale]/(app)/workforce/attendance/actions';
import { AttendanceVoidEventButton } from './attendance-void-event-button';
import { AttendanceReplaceEventForm } from './attendance-replace-event-form';
import { AttendanceVoidDayButton } from './attendance-void-day-button';

interface AttendanceDayDetailPanelProps {
  readonly detail: AttendanceDayDetail;
  readonly canManage: boolean;
}

function formatInstant(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value instanceof Date ? value : new Date(value));
}

export async function AttendanceDayDetailPanel({
  detail,
  canManage,
}: AttendanceDayDetailPanelProps) {
  const t = await getTranslations('workforce.attendance');

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            {detail.employeeName} · {detail.workDate}
          </h3>
          <p className="text-sm text-[var(--pf-text-muted)]">{t(`presence.${detail.presence}`)}</p>
          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('disclaimer')}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            shape={
              detail.status === 'void'
                ? 'void'
                : detail.status === 'complete'
                  ? 'completed'
                  : 'active'
            }
            label={t(`dayStatus.${detail.status}`)}
          />
          {canManage && detail.status !== 'void' ? (
            <AttendanceVoidDayButton dayId={detail.id} action={voidAttendanceDayAction} />
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('events.columns.time')}</TableHead>
              <TableHead>{t('events.columns.type')}</TableHead>
              <TableHead>{t('events.columns.source')}</TableHead>
              <TableHead>{t('events.columns.notes')}</TableHead>
              {canManage ? <TableHead>{t('events.columns.actions')}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.events.map((event) => (
              <TableRow key={event.id} className={event.voidedAt ? 'opacity-50' : undefined}>
                <TableCell>{formatInstant(event.occurredAt)}</TableCell>
                <TableCell>
                  {t(`eventTypes.${event.eventType}`)}
                  {event.voidedAt ? ` (${t('events.voided')})` : ''}
                </TableCell>
                <TableCell>{t(`sources.${event.source}`)}</TableCell>
                <TableCell>{event.notes ?? '-'}</TableCell>
                {canManage ? (
                  <TableCell>
                    {!event.voidedAt && detail.status !== 'void' ? (
                      <div className="flex flex-col gap-2">
                        <AttendanceVoidEventButton
                          eventId={event.id}
                          action={voidAttendanceEventAction}
                        />
                        <AttendanceReplaceEventForm
                          eventId={event.id}
                          defaultType={event.eventType}
                          defaultOccurredAt={event.occurredAt.toISOString().slice(0, 16)}
                          action={replaceAttendanceEventAction}
                        />
                      </div>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
