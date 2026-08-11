'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkOrderStatusBadge } from '@/modules/service/ui/work-order-status-badge';
import type { ServicePriority, ServiceStatus } from '@/modules/service/domain/types';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  rescheduleWorkOrderAction,
  type WorkOrderFormState,
} from '../work-orders/actions';

interface DispatchRowView {
  projectId: string;
  name: string;
  clientName: string | null;
  siteAddress: string | null;
  serviceStatus: ServiceStatus;
  priority: ServicePriority;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  assigneeName: string | null;
  assigneeEmployeeId: string | null;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function DispatchRowEditor({
  row,
  employees,
}: {
  row: DispatchRowView;
  employees: { id: string; name: string }[];
}) {
  const t = useTranslations('service');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<WorkOrderFormState, FormData>(
    rescheduleWorkOrderAction,
    {},
  );

  return (
    <div className="mt-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
        {open ? t('dispatch.hideReschedule') : t('dispatch.reschedule')}
      </Button>
      {open ? (
        <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="workOrderId" value={row.projectId} />
          <Field label={t('create.windowStartLabel')}>
            {(control) => (
              <Input
                {...control}
                name="scheduledStartAt"
                type="datetime-local"
                dir="ltr"
                defaultValue={toDatetimeLocal(row.scheduledStartAt)}
              />
            )}
          </Field>
          <Field label={t('create.windowEndLabel')}>
            {(control) => (
              <Input
                {...control}
                name="scheduledEndAt"
                type="datetime-local"
                dir="ltr"
                defaultValue={toDatetimeLocal(row.scheduledEndAt)}
              />
            )}
          </Field>
          {employees.length > 0 ? (
            <Field label={t('create.assigneeLabel')}>
              {(control) => (
                <Select name="assigneeEmployeeId" defaultValue={row.assigneeEmployeeId ?? undefined}>
                  <SelectTrigger id={control.id}>
                    <SelectValue placeholder={t('create.assigneeNone')} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}
          <Button type="submit" size="sm" loading={pending}>
            {t('dispatch.saveReschedule')}
          </Button>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{t('workspace.saved')}</Alert> : null}
        </form>
      ) : null}
    </div>
  );
}

/**
 * Daily dispatch list — mobile-first. Reschedule uses an explicit form
 * (mobile alternative); no drag/drop-only path.
 */
export function DispatchBoard({
  rows,
  employees,
  canDispatch,
}: {
  rows: DispatchRowView[];
  employees: { id: string; name: string }[];
  canDispatch: boolean;
}) {
  const t = useTranslations('service');

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li
          key={row.projectId}
          className={cn(
            pressableCardLinkClassName,
            'block min-w-0 max-w-full cursor-default p-4',
          )}
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <Link
              href={`/work-orders/${row.projectId}`}
              className={cn(textNavLinkClassName, 'min-w-0 flex-1 break-words font-semibold')}
            >
              {row.name}
            </Link>
            <WorkOrderStatusBadge
              status={row.serviceStatus}
              label={t(`status.${row.serviceStatus}`)}
            />
          </div>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
            {row.assigneeName ?? t('list.unassigned')}
            {' · '}
            {row.clientName ?? '—'}
            {row.siteAddress ? ` · ${row.siteAddress}` : ''}
          </p>
          <p className="mt-1 pf-ltr-island text-sm text-[var(--pf-text-secondary)]" dir="ltr">
            {row.scheduledStartAt
              ? new Date(row.scheduledStartAt).toISOString().slice(0, 16).replace('T', ' ')
              : '—'}
            {row.scheduledEndAt
              ? ` → ${new Date(row.scheduledEndAt).toISOString().slice(0, 16).replace('T', ' ')}`
              : ''}
          </p>
          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
            {t(`priority.${row.priority}`)}
          </p>
          {canDispatch ? <DispatchRowEditor row={row} employees={employees} /> : null}
        </li>
      ))}
    </ul>
  );
}
