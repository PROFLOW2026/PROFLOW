'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { SafetyToolboxAttendeeRecord } from '@/modules/safety/domain/types';
import {
  acknowledgeToolboxAttendeeAction,
  addToolboxAttendeeAction,
  type SafetyFormState,
} from './actions';

export function ToolboxAttendeeForm({ safetyRecordId }: { safetyRecordId: string }) {
  const t = useTranslations('safety');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<SafetyFormState, FormData>(
    addToolboxAttendeeAction,
    {},
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="safetyRecordId" value={safetyRecordId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense className="gap-4">
      <Field label={t('fields.attendeeName')} className={mainAppFieldSpan.lg} error={state.fieldErrors?.attendeeName}>
        {(control) => <Input {...control} name="attendeeName" required className="h-11 text-base" />}
      </Field>
      <div className={mainAppFieldSpan.lg}>
      <Button type="submit" className="h-11 w-full sm:w-auto" loading={pending}>
        {pending ? tCommon('states.saving') : t('actions.addAttendee')}
      </Button>
      </div>
      </MainAppFormGrid>
    </form>
  );
}

export function AcknowledgeAttendeeButton({
  attendee,
  safetyRecordId,
}: {
  attendee: SafetyToolboxAttendeeRecord;
  safetyRecordId: string;
}) {
  const t = useTranslations('safety');
  const [state, formAction, pending] = useActionState<SafetyFormState, FormData>(
    acknowledgeToolboxAttendeeAction,
    {},
  );

  if (attendee.acknowledgedAt) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="attendeeId" value={attendee.id} />
      <input type="hidden" name="safetyRecordId" value={safetyRecordId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {t('actions.acknowledge')}
      </Button>
    </form>
  );
}
