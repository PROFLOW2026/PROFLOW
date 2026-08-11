'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { DraftStatus } from '../domain/types';
import type { RecurringDraftFormState } from './draft-form';

export function RecurringDraftActions({
  draftId,
  status,
  generateAction,
  pauseAction,
  resumeAction,
  endAction,
}: {
  draftId: string;
  status: DraftStatus;
  generateAction: (
    prev: RecurringDraftFormState,
    formData: FormData,
  ) => Promise<RecurringDraftFormState>;
  pauseAction: (
    prev: RecurringDraftFormState,
    formData: FormData,
  ) => Promise<RecurringDraftFormState>;
  resumeAction: (
    prev: RecurringDraftFormState,
    formData: FormData,
  ) => Promise<RecurringDraftFormState>;
  endAction: (prev: RecurringDraftFormState, formData: FormData) => Promise<RecurringDraftFormState>;
}) {
  const t = useTranslations('recurringDrafts');

  const [pauseState, pauseFormAction, pausePending] = useActionState(
    pauseAction,
    {} as RecurringDraftFormState,
  );
  const [resumeState, resumeFormAction, resumePending] = useActionState(
    resumeAction,
    {} as RecurringDraftFormState,
  );
  const [endState, , endPending] = useActionState(endAction, {} as RecurringDraftFormState);

  const anyError = pauseState.error || resumeState.error || endState.error;
  const ended = status === 'ended';

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      {anyError ? <Alert tone="danger">{anyError}</Alert> : null}
      {pauseState.success ? <Alert tone="success">{t('success.paused')}</Alert> : null}
      {resumeState.success ? <Alert tone="success">{t('success.resumed')}</Alert> : null}
      {endState.success ? <Alert tone="success">{t('success.ended')}</Alert> : null}

      <Alert tone="info">{t('detail.draftOnlyNote')}</Alert>

      {status === 'active' ? (
        <ConfirmAction
          title={t('actions.generateTitle')}
          description={t('actions.generateBody')}
          confirmLabel={t('actions.generateConfirm')}
          successMessage={t('success.generated')}
          trigger={
            <Button type="button" className="min-h-11 w-full sm:w-auto">
              {t('actions.generate')}
            </Button>
          }
          onConfirm={async () => {
            const formData = new FormData();
            formData.set('draftId', draftId);
            const result = await generateAction({} as RecurringDraftFormState, formData);
            if (result.error) return { error: result.error };
            return { ok: true };
          }}
        />
      ) : null}

      <div className="flex max-w-full flex-wrap gap-2">
        {status === 'active' ? (
          <form action={pauseFormAction}>
            <input type="hidden" name="draftId" value={draftId} />
            <Button type="submit" variant="secondary" disabled={pausePending} className="min-h-11">
              {t('actions.pause')}
            </Button>
          </form>
        ) : null}

        {status === 'paused' ? (
          <form action={resumeFormAction}>
            <input type="hidden" name="draftId" value={draftId} />
            <Button type="submit" variant="secondary" disabled={resumePending} className="min-h-11">
              {t('actions.resume')}
            </Button>
          </form>
        ) : null}

        {!ended ? (
          <ConfirmAction
            title={t('confirm.endTitle')}
            description={t('confirm.endBody')}
            confirmLabel={t('confirm.endConfirm')}
            successMessage={t('success.ended')}
            trigger={
              <Button type="button" variant="secondary" disabled={endPending} className="min-h-11">
                {t('actions.end')}
              </Button>
            }
            onConfirm={async () => {
              const formData = new FormData();
              formData.set('draftId', draftId);
              const result = await endAction({} as RecurringDraftFormState, formData);
              if (result.error) return { error: result.error };
              return { ok: true };
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
