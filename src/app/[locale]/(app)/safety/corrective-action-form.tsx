'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { SAFETY_ACTION_STATUSES } from '@/modules/safety/domain/types';
import { isCorrectiveActionOverdue } from '@/modules/safety/domain/overdue';
import { safetyActionStatusShape } from '@/modules/safety/ui';
import type { SafetyCorrectiveActionRecord } from '@/modules/safety/domain/types';
import {
  createCorrectiveActionAction,
  updateCorrectiveActionStatusAction,
  type SafetyFormState,
} from './actions';

const NONE = '__none__';

export function CorrectiveActionForm({
  safetyRecordId,
  members,
  today,
}: {
  safetyRecordId: string;
  members: readonly { userId: string; label: string }[];
  today: string;
}) {
  const t = useTranslations('safety');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<SafetyFormState, FormData>(
    createCorrectiveActionAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="safetyRecordId" value={safetyRecordId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('detail.saved')}</Alert> : null}
      <Field label={t('fields.correctiveAction')} required error={state.fieldErrors?.title}>
        {(control) => <Input {...control} name="title" required className="h-11 text-base" />}
      </Field>
      <Field label={t('fields.description')}>
        {(control) => <Textarea {...control} name="description" rows={2} className="min-h-16 text-base" />}
      </Field>
      {members.length > 0 ? (
        <Field label={t('fields.owner')}>
          {(control) => (
            <select
              {...control}
              name="ownerUserId"
              defaultValue={NONE}
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            >
              <option value={NONE}>{t('fields.ownerNone')}</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      <Field label={t('fields.dueDate')}>
        {(control) => (
          <Input {...control} type="date" name="dueDate" min={today} className="h-11 text-base" />
        )}
      </Field>
      <Button type="submit" className="h-11 w-full sm:w-auto" loading={pending}>
        {pending ? tCommon('states.saving') : t('actions.addAction')}
      </Button>
    </form>
  );
}

export function CorrectiveActionStatusForm({
  action,
  today,
}: {
  action: SafetyCorrectiveActionRecord;
  today: string;
}) {
  const t = useTranslations('safety');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<SafetyFormState, FormData>(
    updateCorrectiveActionStatusAction,
    {},
  );
  const overdue = isCorrectiveActionOverdue(action, today);

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="actionId" value={action.id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('fields.status')} className="sm:w-44">
        {(control) => (
          <select
            {...control}
            name="status"
            defaultValue={action.status}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            {SAFETY_ACTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Button type="submit" variant="secondary" className="h-11" loading={pending}>
        {pending ? tCommon('states.saving') : tCommon('actions.save')}
      </Button>
      {overdue ? (
        <StatusBadge shape={safetyActionStatusShape(action.status, true)} label={t('overdue')} />
      ) : null}
    </form>
  );
}
