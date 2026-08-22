'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TimeApprovalStatus } from '@/modules/workforce/domain/types';
import { Link } from '@/shared/i18n/navigation';
import {
  DeleteDraftTimeEntryButton,
  SubmitTimeEntryButton,
} from './timesheet-actions';
import { updateTimeEntryAction, type TimeEntryFormState } from '@/app/[locale]/(app)/workforce/time/actions';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';

function InlineEditHours({
  entryId,
  hours,
}: {
  readonly entryId: string;
  readonly hours: string;
}) {
  const t = useTranslations('workforce');
  const [state, action, pending] = useActionState(updateTimeEntryAction, {} as TimeEntryFormState);

  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2 pt-2">
      <input type="hidden" name="timeEntryId" value={entryId} />
      <Input
        name="hours"
        defaultValue={hours}
        inputMode="decimal"
        className="h-10 min-w-0 flex-1"
        aria-label={t('time.form.hours')}
      />
      <Button type="submit" size="sm" loading={pending} className="shrink-0">
        {t('time.actions.saveHours')}
      </Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
    </form>
  );
}

export function TimeEntryMobileActions({
  entryId,
  employeeId,
  hours,
  approvalStatus,
  status,
}: {
  readonly entryId: string;
  readonly employeeId: string;
  readonly hours: string;
  readonly approvalStatus: TimeApprovalStatus;
  readonly status: 'recorded' | 'void';
}) {
  const t = useTranslations('workforce');
  const [editing, setEditing] = useState(false);

  if (status === 'void') return null;

  const canEditDraft = approvalStatus === 'draft' || approvalStatus === 'returned';
  const isApproved = approvalStatus === 'approved';

  return (
    <div className="mt-1.5 w-full min-w-0">
      <div className="flex flex-wrap gap-2">
        {isApproved ? (
          <Button asChild variant="secondary" size="sm" className="min-h-10">
            <Link href={`/workforce/time/new?correctsEntryId=${entryId}`}>{t('time.correct')}</Link>
          </Button>
        ) : null}
        {canEditDraft ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-10"
              onClick={() => setEditing((open) => !open)}
            >
              {t('time.mobile.edit')}
            </Button>
            <DeleteDraftTimeEntryButton entryId={entryId} approvalStatus={approvalStatus} compact />
            <SubmitTimeEntryButton
              entryId={entryId}
              employeeId={employeeId}
              approvalStatus={approvalStatus}
              compact
            />
          </>
        ) : null}
      </div>
      {editing && canEditDraft ? <InlineEditHours entryId={entryId} hours={hours} /> : null}
    </div>
  );
}
