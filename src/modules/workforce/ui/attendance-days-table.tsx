import { getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AttendanceDayListItem } from '@/modules/workforce';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

interface AttendanceDaysTableProps {
  readonly days: readonly AttendanceDayListItem[];
}

function formatInstant(value: Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function dayShape(status: AttendanceDayListItem['status']) {
  if (status === 'void') return 'void' as const;
  if (status === 'complete') return 'completed' as const;
  return 'active' as const;
}

export async function AttendanceDaysTable({ days }: AttendanceDaysTableProps) {
  const t = await getTranslations('workforce.attendance');

  if (days.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title={t('list.empty.title')}
        description={t('list.empty.description')}
      />
    );
  }

  return (
    <ResponsiveTable
      items={days}
      getRowKey={(day) => day.id}
      desktop={
        <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('list.columns.date')}</TableHead>
                <TableHead>{t('list.columns.employee')}</TableHead>
                <TableHead>{t('list.columns.clockIn')}</TableHead>
                <TableHead>{t('list.columns.clockOut')}</TableHead>
                <TableHead>{t('list.columns.status')}</TableHead>
                <TableHead>{t('list.columns.events')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((day) => (
                <TableRow key={day.id}>
                  <TableCell>
                    <Link
                      href={`/workforce/attendance?dayId=${day.id}`}
                      className="font-medium text-[var(--pf-text-primary)] underline-offset-2 hover:underline"
                    >
                      {day.workDate}
                    </Link>
                  </TableCell>
                  <TableCell>{day.employeeName}</TableCell>
                  <TableCell>{formatInstant(day.clockInAt)}</TableCell>
                  <TableCell>{formatInstant(day.clockOutAt)}</TableCell>
                  <TableCell>
                    <StatusBadge shape={dayShape(day.status)} label={t(`dayStatus.${day.status}`)} />
                  </TableCell>
                  <TableCell>{day.eventCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      }
      renderMobileCard={(day) => (
        <Link
          href={`/workforce/attendance?dayId=${day.id}`}
          className={cn(pressableCardLinkClassName, 'hover:bg-[var(--pf-bg-subtle)]')}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 text-start">
              <p className="truncate font-medium">{day.employeeName}</p>
              <p className="text-xs text-[var(--pf-text-muted)]">{day.workDate}</p>
            </div>
            <StatusBadge shape={dayShape(day.status)} label={t(`dayStatus.${day.status}`)} />
          </div>
          <p className="mt-2 text-start text-sm text-[var(--pf-text-secondary)]">
            {t('clock.in')}: {formatInstant(day.clockInAt)} · {t('clock.out')}:{' '}
            {formatInstant(day.clockOutAt)}
          </p>
        </Link>
      )}
    />
  );
}
