'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { isDailyLogLocked } from '@/modules/field-ops/domain/daily-log-status';
import type { DailyLogRecord } from '@/modules/field-ops/domain/types';
import { useRouter } from '@/shared/i18n/navigation';
import {
  appendDailyLogCorrectionAction,
  transitionDailyLogStatusAction,
  type FieldOpsFormState,
} from '../actions';

export function DailyLogStatusActions({ log }: { log: DailyLogRecord }) {
  const t = useTranslations('fieldOps.lifecycle');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const locked = isDailyLogLocked(log.status);

  const [submitState, submitAction, submitPending] = useActionState<FieldOpsFormState, FormData>(
    transitionDailyLogStatusAction,
    {},
  );
  const [correctionState, correctionAction, correctionPending] = useActionState<
    FieldOpsFormState,
    FormData
  >(appendDailyLogCorrectionAction, {});

  const error = submitState.error ?? correctionState.error;
  const success = submitState.success || correctionState.success ? t('saved') : null;

  return (
    <div className="flex max-w-lg flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      {locked ? <Alert tone="info">{t('locked')}</Alert> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {log.status === 'draft' ? (
          <form action={submitAction}>
            <input type="hidden" name="dailyLogId" value={log.id} />
            <input type="hidden" name="status" value="submitted" />
            <Button type="submit" variant="secondary" className="h-11 w-full sm:w-auto" loading={submitPending}>
              {submitPending ? tCommon('states.saving') : t('submit')}
            </Button>
          </form>
        ) : null}

        {log.status === 'draft' || log.status === 'submitted' ? (
          <ConfirmAction
            trigger={
              <Button type="button" className="h-11 w-full sm:w-auto">
                {t('finalize')}
              </Button>
            }
            title={t('finalizeTitle')}
            description={t('finalizeBody')}
            confirmLabel={t('finalize')}
            successMessage={t('saved')}
            onConfirm={async () => {
              const formData = new FormData();
              formData.set('dailyLogId', log.id);
              formData.set('status', 'finalized');
              const result = await transitionDailyLogStatusAction({}, formData);
              if (result.error) return { error: result.error };
              router.refresh();
              return { ok: true };
            }}
          />
        ) : null}
      </div>

      {locked ? (
        <form action={correctionAction} className="flex flex-col gap-3">
          <input type="hidden" name="dailyLogId" value={log.id} />
          <Field
            label={t('correctionLabel')}
            description={t('correctionHint')}
            error={correctionState.fieldErrors?.note}
          >
            {(control) => (
              <Textarea {...control} name="note" rows={3} required className="min-h-20 text-base" />
            )}
          </Field>
          <Button
            type="submit"
            variant="secondary"
            className="h-11 w-full sm:w-auto"
            loading={correctionPending}
          >
            {correctionPending ? tCommon('states.saving') : t('correctionSubmit')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
