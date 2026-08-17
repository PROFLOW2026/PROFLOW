'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  saveDraftAction,
  type CommunicationsFormState,
} from '@/app/[locale]/(app)/communications/actions';
import { COMMUNICATION_ENTITY_TYPES } from '@/modules/communications/domain/types';

export function CommunicationComposeForm({
  defaults,
  emailConfigured,
}: {
  defaults?: {
    communicationId?: string;
    recipientEmail?: string;
    recipientName?: string;
    subject?: string;
    bodyText?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    projectId?: string;
    clientId?: string;
    vendorId?: string;
  };
  emailConfigured: boolean;
}) {
  const t = useTranslations('communications');
  const [state, action, pending] = useActionState<CommunicationsFormState, FormData>(
    saveDraftAction,
    {},
  );

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      {defaults?.communicationId ? (
        <input type="hidden" name="communicationId" value={defaults.communicationId} />
      ) : null}
      {defaults?.relatedEntityId ? (
        <input type="hidden" name="relatedEntityId" value={defaults.relatedEntityId} />
      ) : null}
      {defaults?.projectId ? <input type="hidden" name="projectId" value={defaults.projectId} /> : null}
      {defaults?.clientId ? <input type="hidden" name="clientId" value={defaults.clientId} /> : null}
      {defaults?.vendorId ? <input type="hidden" name="vendorId" value={defaults.vendorId} /> : null}

      {!emailConfigured ? (
        <Alert tone="warning">{t('provider.notConfigured')}</Alert>
      ) : (
        <Alert tone="info">{t('provider.configured')}</Alert>
      )}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label={t('fields.related')}>
        {(control) => (
          <select
            {...control}
            name="relatedEntityType"
            defaultValue={defaults?.relatedEntityType ?? 'other'}
            className="h-10 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
          >
            {COMMUNICATION_ENTITY_TYPES.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('fields.to')} error={state.fieldErrors?.recipientEmail}>
        {(control) => (
          <Input
            {...control}
            name="recipientEmail"
            type="email"
            required
            defaultValue={defaults?.recipientEmail ?? ''}
          />
        )}
      </Field>
      <Field label={t('fields.recipientName')}>
        {(control) => (
          <Input {...control} name="recipientName" defaultValue={defaults?.recipientName ?? ''} />
        )}
      </Field>
      <Field label={t('fields.subject')}>
        {(control) => (
          <Input {...control} name="subject" required defaultValue={defaults?.subject ?? ''} />
        )}
      </Field>
      <Field label={t('fields.body')}>
        {(control) => (
          <Textarea {...control} name="bodyText" required rows={8} defaultValue={defaults?.bodyText ?? ''} />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
          {t('actions.saveDraft')}
        </Button>
        <Button type="submit" name="intent" value="send" disabled={pending}>
          {t('actions.send')}
        </Button>
      </div>
    </form>
  );
}
