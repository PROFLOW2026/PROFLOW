'use client';

import { useTranslations } from 'next-intl';
import { useActionState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { ChangeRequestStatus } from '@/modules/commercial/domain/types';
import type { FormActionState } from '../actions';

export interface ChangeActionButtonsProps {
  changeRequestId: string;
  status: ChangeRequestStatus;
  submitAction: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  rejectAction: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  cancelAction: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
}

function ActionForm({
  changeRequestId,
  action,
  children,
  recordSent,
}: {
  changeRequestId: string;
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  children: ReactNode;
  recordSent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="changeRequestId" value={changeRequestId} />
      {recordSent ? <input type="hidden" name="recordSent" value="true" /> : null}
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {children}
      </Button>
      {state.error ? (
        <span className="ms-2 text-xs text-[var(--pf-status-danger-fg)]">{state.error}</span>
      ) : null}
    </form>
  );
}

export function ChangeActionButtons({
  changeRequestId,
  status,
  submitAction,
  rejectAction,
  cancelAction,
}: ChangeActionButtonsProps) {
  const t = useTranslations('changes.actions');

  if (status === 'draft') {
    return (
      <div className="flex max-w-full flex-wrap gap-2">
        <ActionForm changeRequestId={changeRequestId} action={submitAction}>
          {t('submit')}
        </ActionForm>
        <ActionForm changeRequestId={changeRequestId} action={submitAction} recordSent>
          {t('submitAndSent')}
        </ActionForm>
        <ActionForm changeRequestId={changeRequestId} action={cancelAction}>
          {t('cancel')}
        </ActionForm>
      </div>
    );
  }

  if (status === 'awaiting_approval') {
    return (
      <div className="flex max-w-full flex-wrap gap-2">
        <ActionForm changeRequestId={changeRequestId} action={rejectAction}>
          {t('reject')}
        </ActionForm>
        <ActionForm changeRequestId={changeRequestId} action={cancelAction}>
          {t('cancel')}
        </ActionForm>
      </div>
    );
  }

  return null;
}
