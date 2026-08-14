'use client';

import { useActionState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { templateRequiresAcknowledgement } from '@/modules/forms/domain/schema';
import type {
  FormFieldDefinition,
  FormSubmissionRecord,
  FormTemplateRecord,
} from '@/modules/forms/domain/types';
import { useOfflineAwareFormAction } from '@/modules/offline/ui/use-offline-aware-form-action';
import {
  saveDraftAction,
  submitAction,
  voidAction,
  type FormFillActionState,
} from './form-fill-actions';

function readAnswer(answers: Record<string, unknown> | null, key: string): unknown {
  return answers?.[key] ?? null;
}

function FieldControl({
  field,
  answers,
  readOnly,
}: {
  field: FormFieldDefinition;
  answers: Record<string, unknown> | null;
  readOnly: boolean;
}) {
  const t = useTranslations('forms');
  const value = readAnswer(answers, field.key);
  const name = `answer_${field.key}`;

  switch (field.type) {
    case 'checklist': {
      const checked =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, boolean>)
          : {};
      return (
        <fieldset className="flex flex-col gap-2" disabled={readOnly}>
          <legend className="sr-only">{field.label}</legend>
          {(field.items ?? []).map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`${name}__${item.key}`}
                defaultChecked={checked[item.key] === true}
                value="true"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
      );
    }
    case 'yes_no': {
      const current = value === true ? 'yes' : value === false ? 'no' : '';
      return (
        <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label={field.label}>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={name}
              value="yes"
              defaultChecked={current === 'yes'}
              disabled={readOnly}
            />
            {t('fill.yes')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={name}
              value="no"
              defaultChecked={current === 'no'}
              disabled={readOnly}
            />
            {t('fill.no')}
          </label>
        </div>
      );
    }
    case 'notes':
      return (
        <Textarea
          name={name}
          rows={4}
          defaultValue={typeof value === 'string' ? value : ''}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
    case 'number':
      return (
        <Input
          name={name}
          type="number"
          inputMode="decimal"
          defaultValue={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
    case 'date':
      return (
        <Input
          name={name}
          type="date"
          defaultValue={typeof value === 'string' ? value : ''}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
    case 'photo':
      return (
        <Alert tone="info" title={t('photoNote.title')}>
          {t('photoNote.body')}
          <input type="hidden" name={name} value={JSON.stringify(value ?? { documentIds: [] })} />
        </Alert>
      );
    case 'signature':
      return (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value="true"
              defaultChecked={
                Boolean(
                  value &&
                    typeof value === 'object' &&
                    !Array.isArray(value) &&
                    (value as { acknowledged?: boolean }).acknowledged,
                )
              }
              disabled={readOnly}
            />
            {field.label}
          </label>
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('fill.signatureHelp')}</p>
        </div>
      );
    case 'text':
    default:
      return (
        <Input
          name={name}
          defaultValue={typeof value === 'string' ? value : ''}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
  }
}

export function FormFillPanel({
  submission,
  template,
  canManage,
}: {
  submission: FormSubmissionRecord;
  template: FormTemplateRecord;
  canManage: boolean;
}) {
  const t = useTranslations('forms');
  const tOffline = useTranslations('offline');
  const readOnly = submission.status !== 'draft' || !canManage;
  const needsAck = templateRequiresAcknowledgement(template.schema);
  const serverUpdatedAt =
    submission.updatedAt instanceof Date
      ? submission.updatedAt.toISOString()
      : new Date(submission.updatedAt).toISOString();

  const offlineSuccessState = useMemo<FormFillActionState>(
    () => ({ ok: true, offlineQueued: true }),
    [],
  );

  const draftWrapped = useOfflineAwareFormAction<FormFillActionState>({
    kind: 'form_submission',
    onlineAction: saveDraftAction,
    buildPayload: (formData) => Object.fromEntries(formData.entries()),
    resolveServerMeta: () => ({
      serverId: submission.id,
      serverUpdatedAt,
    }),
    offlineSuccessState,
    missingOrgError: tOffline('errors.missingOrganization'),
  });

  const [draftState, draftFormAction, draftPending] = useActionState<
    FormFillActionState,
    FormData
  >(draftWrapped, {});
  const [submitState, submitFormAction, submitPending] = useActionState<
    FormFillActionState,
    FormData
  >(submitAction, {});
  const [voidState, voidFormAction, voidPending] = useActionState<FormFillActionState, FormData>(
    voidAction,
    {},
  );

  const pending = draftPending || submitPending || voidPending;
  const error = draftState.error ?? submitState.error ?? voidState.error;
  const successMessage = draftState.offlineQueued
    ? t('fill.offlineQueued')
    : submitState.ok
      ? t('fill.submitted')
      : voidState.ok
        ? t('fill.voided')
        : draftState.ok
          ? t('fill.saved')
          : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <Alert tone="info">{t('acknowledgementDisclaimer')}</Alert>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {successMessage ? (
        <Alert tone="success" role="status">
          {successMessage}
        </Alert>
      ) : null}

      {readOnly ? <Alert tone="warning">{t('fill.readOnly')}</Alert> : null}

      <form action={draftFormAction} className="flex flex-col gap-4">
        <input type="hidden" name="submissionId" value={submission.id} />
        {template.schema.fields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            required={field.required}
            description={field.helpText ?? undefined}
          >
            {() => (
              <FieldControl field={field} answers={submission.answers} readOnly={readOnly} />
            )}
          </Field>
        ))}

        {needsAck ? (
          <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <p className="mb-3 text-sm text-[var(--pf-text-secondary)]">
              {t('acknowledgementDisclaimer')}
            </p>
            <Field label={t('fill.acknowledgementName')} required>
              {(props) => (
                <Input
                  {...props}
                  name="acknowledgementName"
                  defaultValue={submission.acknowledgementName ?? ''}
                  readOnly={readOnly}
                  disabled={readOnly}
                  required={!readOnly}
                />
              )}
            </Field>
            <div className="mt-3">
              <Field label={t('fill.acknowledgementNote')}>
                {(props) => (
                  <Textarea
                    {...props}
                    name="acknowledgementNote"
                    rows={2}
                    defaultValue={submission.acknowledgementNote ?? ''}
                    readOnly={readOnly}
                    disabled={readOnly}
                  />
                )}
              </Field>
            </div>
          </div>
        ) : null}

        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={pending}>
              {t('fill.saveDraft')}
            </Button>
            <Button formAction={submitFormAction} type="submit" loading={pending}>
              {t('fill.submit')}
            </Button>
            <Button formAction={voidFormAction} type="submit" variant="ghost" loading={pending}>
              {t('fill.void')}
            </Button>
          </div>
        ) : canManage && submission.status !== 'void' ? (
          <Button formAction={voidFormAction} type="submit" variant="ghost" loading={voidPending}>
            {t('fill.void')}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
