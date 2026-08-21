'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { TimeApprovalStatus } from '@/modules/workforce/domain/types';
import {
  approveTimesheetAction,
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
}: {
  readonly entryId: string;
  readonly employeeId: string;
  readonly approvalStatus: TimeApprovalStatus;
}) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(submitTimeEntriesAction, {});

  if (approvalStatus !== 'draft' && approvalStatus !== 'returned') return null;

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="entryIds" value={entryId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {t('time.actions.submitForApproval')}
      </Button>
      <ActionError state={state} />
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
