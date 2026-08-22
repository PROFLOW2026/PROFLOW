'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { TimeApprovalStatus } from '@/modules/workforce/domain/types';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import {
  approveTimesheetAction,
  deleteDraftTimeEntryAction,
  excessTimeEntryDecisionAction,
  returnTimesheetAction,
  submitTimeEntriesAction,
  updateTimeEntryAction,
  type TimeEntryFormState,
} from '@/app/[locale]/(app)/workforce/time/actions';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';

function ActionError({ state }: { state: TimeEntryFormState }) {
  if (!state.error) return null;
  return <Alert tone="danger">{state.error}</Alert>;
}

export function SubmitTimeEntryButton({
  entryId,
  employeeId,
  approvalStatus,
  compact = false,
}: {
  readonly entryId: string;
  readonly employeeId: string;
  readonly approvalStatus: TimeApprovalStatus;
  readonly compact?: boolean;
}) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(submitTimeEntriesAction, {});

  if (approvalStatus !== 'draft' && approvalStatus !== 'returned') return null;

  return (
    <form action={action} className={compact ? 'contents' : 'flex flex-col items-start gap-1'}>
      <input type="hidden" name="entryIds" value={entryId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <Button
        type="submit"
        variant={compact ? 'primary' : 'secondary'}
        size="sm"
        loading={pending}
        className={compact ? 'min-h-10' : undefined}
      >
        {t('time.actions.submitForApproval')}
      </Button>
      {!compact && state.error ? <ActionError state={state} /> : null}
    </form>
  );
}

export function EditDraftTimeEntryForm({
  entryId,
  hours,
  approvalStatus,
}: {
  readonly entryId: string;
  readonly hours: string;
  readonly approvalStatus: TimeApprovalStatus;
}) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(updateTimeEntryAction, {});

  if (approvalStatus !== 'draft' && approvalStatus !== 'returned') return null;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="timeEntryId" value={entryId} />
      <label className="flex min-w-[6rem] flex-col gap-1 text-xs">
        <span>{t('time.form.hours')}</span>
        <Input name="hours" defaultValue={hours} inputMode="decimal" className="h-11 min-w-[5rem]" />
      </label>
      <Button type="submit" variant="ghost" size="sm" loading={pending} className="min-h-11">
        {t('time.actions.saveHours')}
      </Button>
      <ActionError state={state} />
    </form>
  );
}

export function DeleteDraftTimeEntryButton({
  entryId,
  approvalStatus,
  compact = false,
}: {
  readonly entryId: string;
  readonly approvalStatus: TimeApprovalStatus;
  readonly compact?: boolean;
}) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(deleteDraftTimeEntryAction, {});

  if (approvalStatus !== 'draft' && approvalStatus !== 'returned') return null;

  return (
    <form action={action} className={compact ? 'contents' : 'flex flex-col items-start gap-1'}>
      <input type="hidden" name="timeEntryId" value={entryId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        loading={pending}
        className={compact ? 'min-h-10 text-[var(--pf-status-danger-fg)]' : 'text-[var(--pf-status-danger-fg)]'}
      >
        {t('time.mobile.delete')}
      </Button>
      {!compact && state.error ? <ActionError state={state} /> : null}
    </form>
  );
}

export function ExcessHoursApprovalPanel({
  entryId,
  excessHours,
  excessApprovalStatus,
}: {
  readonly entryId: string;
  readonly excessHours: string | null;
  readonly excessApprovalStatus: 'pending' | 'approved' | 'rejected' | null;
}) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(excessTimeEntryDecisionAction, {});

  if (!excessHours || Number(excessHours) <= 0 || excessApprovalStatus !== 'pending') {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
      <p className="text-sm font-medium">{t('time.approvals.excessTitle')}</p>
      <p className="text-xs text-[var(--pf-text-secondary)]">
        {t('time.approvals.excessAmount', { hours: formatWorkHoursValue(excessHours) })}
      </p>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="timeEntryId" value={entryId} />
        <Field label={t('time.approvals.managerNote')} optionalLabel={t('time.approvals.optionalForApprove')}>
          {(control) => (
            <Textarea
              {...control}
              name="managerNote"
              rows={2}
              placeholder={t('time.approvals.managerNotePlaceholder')}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="decision" value="approve" size="sm" loading={pending}>
            {t('time.approvals.excessApprove')}
          </Button>
          <Button type="submit" name="decision" value="reject" variant="secondary" size="sm" loading={pending}>
            {t('time.approvals.excessReject')}
          </Button>
        </div>
        <ActionError state={state} />
      </form>
    </div>
  );
}

export function SubmitTimesheetButton({
  employeeId,
  periodStart,
}: {
  readonly employeeId: string;
  readonly periodStart: string;
}) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(submitTimeEntriesAction, {});

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="periodStart" value={periodStart} />
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {t('time.actions.submitForApproval')}
      </Button>
      <ActionError state={state} />
    </form>
  );
}

export function ApproveTimesheetButton({
  timesheetId,
  timeEntryId,
}: {
  readonly timesheetId?: string;
  readonly timeEntryId?: string;
}) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(approveTimesheetAction, {});

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      {timesheetId ? <input type="hidden" name="timesheetId" value={timesheetId} /> : null}
      {timeEntryId ? <input type="hidden" name="timeEntryId" value={timeEntryId} /> : null}
      <Button type="submit" size="sm" loading={pending}>
        {t('time.approvals.approve')}
      </Button>
      <ActionError state={state} />
    </form>
  );
}

export function ReturnTimesheetForm({ timesheetId }: { readonly timesheetId: string }) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(returnTimesheetAction, {});

  return (
    <form action={action} className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name="timesheetId" value={timesheetId} />
      <Field label={t('time.approvals.managerNote')} required>
        {(control) => (
          <Textarea
            {...control}
            name="managerNote"
            required
            rows={3}
            placeholder={t('time.approvals.managerNotePlaceholder')}
          />
        )}
      </Field>
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {t('time.approvals.return')}
      </Button>
      <ActionError state={state} />
    </form>
  );
}

export function BulkApproveEntriesForm({ entryIds }: { readonly entryIds: readonly string[] }) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(approveTimesheetAction, {});
  if (entryIds.length === 0) return null;

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      {entryIds.map((id) => (
        <input key={id} type="hidden" name="entryIds" value={id} />
      ))}
      <Button type="submit" size="sm" loading={pending}>
        {t('time.approvals.approveSelected')}
      </Button>
      <ActionError state={state} />
    </form>
  );
}
