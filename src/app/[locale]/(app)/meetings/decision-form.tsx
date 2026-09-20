'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MeetingDecision } from '@/modules/meetings';
import {
  createDecisionAction,
  updateDecisionAction,
  type MeetingFormState,
} from './actions';

function toDateInput(value: Date | null): string | undefined {
  if (!value) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function DecisionForm({
  mode,
  meetingId,
  decision,
}: {
  mode: 'create' | 'edit';
  meetingId: string;
  decision?: MeetingDecision;
}) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const action = mode === 'create' ? createDecisionAction : updateDecisionAction;
  const [state, formAction, pending] = useActionState<MeetingFormState, FormData>(action, {});

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      {decision ? <input type="hidden" name="decisionId" value={decision.id} /> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Alert tone="info">{t('meetings.form.decisionNote')}</Alert>

      <Field label={t('meetings.fields.title')} required error={state.fieldErrors?.title}>
        {(control) => (
          <Input
            {...control}
            name="title"
            required
            defaultValue={decision?.title ?? ''}
            className="h-11 text-base"
          />
        )}
      </Field>

      <Field label={t('meetings.form.body')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Textarea
            {...control}
            name="body"
            rows={4}
            defaultValue={decision?.body ?? ''}
            className="min-h-24 text-base"
          />
        )}
      </Field>

      <Field label={t('meetings.form.decidedAt')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input
            {...control}
            name="decidedAt"
            type="date"
            defaultValue={toDateInput(decision?.decidedAt ?? null)}
            className="h-11 text-base"
          />
        )}
      </Field>

      <Button type="submit" loading={pending} block>
        {mode === 'create' ? t('meetings.decision.add') : tCommon('actions.save')}
      </Button>
    </form>
  );
}
