'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { convertJobToProjectAction, type JobFormState } from '../actions';

interface ConvertJobButtonProps {
  jobId: string;
  /** When false, convert is disabled (e.g. open-price / no managed revenue). */
  canConvert?: boolean;
  /** Shown when convert is blocked; defaults to requiresRevenueBasis copy. */
  blockedReason?: string;
}

export function ConvertJobButton({
  jobId,
  canConvert = true,
  blockedReason,
}: ConvertJobButtonProps) {
  const t = useTranslations('jobs');
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(
    convertJobToProjectAction,
    {},
  );
  const whyBlocked = blockedReason ?? t('convert.requiresRevenueBasis');

  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-2"
      onSubmit={(event) => {
        if (!canConvert) {
          event.preventDefault();
          return;
        }
        if (!window.confirm(t('workspace.convertConfirm'))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <p className="max-w-xs text-end text-xs text-[var(--pf-text-secondary)]">
        {canConvert ? t('workspace.convertHint') : whyBlocked}
      </p>
      <Button
        type="submit"
        variant="secondary"
        loading={pending}
        disabled={!canConvert}
        title={canConvert ? t('workspace.convertHint') : whyBlocked}
      >
        {t('workspace.convertToProject')}
      </Button>
    </form>
  );
}
