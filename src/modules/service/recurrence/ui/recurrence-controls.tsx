'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { RecurrenceDefinitionStatus } from '../domain/types';
import type { RecurrenceFormState } from './recurrence-create-form';

interface RecurrenceControlsProps {
  definitionId: string;
  status: RecurrenceDefinitionStatus;
  nextOccurrenceDate: string | null;
  generateAction: (prev: RecurrenceFormState, formData: FormData) => Promise<RecurrenceFormState>;
  pauseAction: (prev: RecurrenceFormState, formData: FormData) => Promise<RecurrenceFormState>;
  resumeAction: (prev: RecurrenceFormState, formData: FormData) => Promise<RecurrenceFormState>;
  endAction: (prev: RecurrenceFormState, formData: FormData) => Promise<RecurrenceFormState>;
  skipAction: (prev: RecurrenceFormState, formData: FormData) => Promise<RecurrenceFormState>;
}

export function RecurrenceControls({
  definitionId,
  status,
  nextOccurrenceDate,
  generateAction,
  pauseAction,
  resumeAction,
  endAction,
  skipAction,
}: RecurrenceControlsProps) {
  const t = useTranslations('service.recurring');
  const tCommon = useTranslations('common');

  const [generateState, generateFormAction, generatePending] = useActionState(
    generateAction,
    {} as RecurrenceFormState,
  );
  const [pauseState, pauseFormAction, pausePending] = useActionState(
    pauseAction,
    {} as RecurrenceFormState,
  );
  const [resumeState, resumeFormAction, resumePending] = useActionState(
    resumeAction,
    {} as RecurrenceFormState,
  );
  const [endState, endFormAction, endPending] = useActionState(endAction, {} as RecurrenceFormState);
  const [skipState, skipFormAction, skipPending] = useActionState(
    skipAction,
    {} as RecurrenceFormState,
  );

  const anyError =
    generateState.error ||
    pauseState.error ||
    resumeState.error ||
    endState.error ||
    skipState.error;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      {anyError ? <Alert tone="danger">{anyError}</Alert> : null}
      {generateState.success ? (
        <Alert tone="success">
          {t('success.generated', { count: generateState.generatedCount ?? 0 })}
        </Alert>
      ) : null}
      {pauseState.success ? <Alert tone="success">{t('success.paused')}</Alert> : null}
      {resumeState.success ? <Alert tone="success">{t('success.resumed')}</Alert> : null}
      {endState.success ? <Alert tone="success">{t('success.ended')}</Alert> : null}
      {skipState.success ? <Alert tone="success">{t('success.skipped')}</Alert> : null}

      {status === 'active' ? (
        <>
          <form action={generateFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="definitionId" value={definitionId} />
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('actions.generateHint')}</p>
            <Button type="submit" disabled={generatePending} className="min-h-11 w-full sm:w-auto">
              {generatePending ? tCommon('actions.saving') : t('actions.generate')}
            </Button>
          </form>

          <form action={pauseFormAction}>
            <input type="hidden" name="definitionId" value={definitionId} />
            <Button
              type="submit"
              variant="secondary"
              disabled={pausePending}
              className="min-h-11 w-full sm:w-auto"
            >
              {t('actions.pause')}
            </Button>
          </form>

          {nextOccurrenceDate ? (
            <form action={skipFormAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="definitionId" value={definitionId} />
              <input type="hidden" name="occurrenceDate" value={nextOccurrenceDate} />
              <Field label={t('actions.skipReason')} className="flex-1">
                {(control) => <Input {...control} name="reason" maxLength={500} />}
              </Field>
              <Button
                type="submit"
                variant="secondary"
                disabled={skipPending}
                className="min-h-11 w-full sm:w-auto"
              >
                {t('actions.skipNext')}
              </Button>
            </form>
          ) : null}
        </>
      ) : null}

      {status === 'paused' ? (
        <form action={resumeFormAction}>
          <input type="hidden" name="definitionId" value={definitionId} />
          <Button type="submit" disabled={resumePending} className="min-h-11 w-full sm:w-auto">
            {t('actions.resume')}
          </Button>
        </form>
      ) : null}

      {status !== 'ended' ? (
        <form action={endFormAction}>
          <input type="hidden" name="definitionId" value={definitionId} />
          <Button
            type="submit"
            variant="danger"
            disabled={endPending}
            className="min-h-11 w-full sm:w-auto"
          >
            {t('actions.end')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
