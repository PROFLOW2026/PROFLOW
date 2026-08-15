'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  SAFETY_RECORD_STATUSES,
  SAFETY_RECORD_TYPES,
  SAFETY_SEVERITIES,
  type SafetyRecordDetail,
} from '@/modules/safety/domain/types';
import {
  createSafetyRecordAction,
  updateSafetyRecordAction,
  type SafetyFormState,
} from './actions';

const NONE = '__none__';

function toDatetimeLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function SafetyRecordForm({
  mode,
  record,
  projects,
  defaultOccurredAt,
}: {
  mode: 'create' | 'edit';
  record?: SafetyRecordDetail;
  projects: readonly { id: string; name: string }[];
  defaultOccurredAt: Date;
}) {
  const t = useTranslations('safety');
  const tCommon = useTranslations('common');
  const action = mode === 'create' ? createSafetyRecordAction : updateSafetyRecordAction;
  const [state, formAction, pending] = useActionState<SafetyFormState, FormData>(action, {});
  const [recordType, setRecordType] = useState(record?.recordType ?? 'incident');
  const [projectId, setProjectId] = useState(record?.projectId ?? NONE);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {record ? <input type="hidden" name="safetyRecordId" value={record.id} /> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('detail.saved')}</Alert> : null}

      <Field label={t('fields.type')} required>
        {(control) => (
          <>
            <input type="hidden" name="recordType" value={recordType} />
            <select
              {...control}
              value={recordType}
              onChange={(event) => setRecordType(event.target.value as typeof recordType)}
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            >
              {SAFETY_RECORD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </select>
          </>
        )}
      </Field>

      <Field label={t('fields.title')} required error={state.fieldErrors?.title}>
        {(control) => (
          <Input {...control} name="title" required defaultValue={record?.title ?? ''} className="h-11 text-base" />
        )}
      </Field>

      <Field label={t('fields.description')} required error={state.fieldErrors?.description}>
        {(control) => (
          <Textarea
            {...control}
            name="description"
            required
            rows={4}
            defaultValue={record?.description ?? ''}
            className="min-h-24 text-base"
          />
        )}
      </Field>

      <Field label={t('fields.project')}>
        {(control) => (
          <>
            <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
            <select
              {...control}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            >
              <option value={NONE}>{t('fields.projectNone')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </>
        )}
      </Field>

      <Field label={t('fields.occurredAt')} required>
        {(control) => (
          <Input
            {...control}
            type="datetime-local"
            name="occurredAt"
            required
            defaultValue={toDatetimeLocal(record?.occurredAt ?? defaultOccurredAt)}
            className="h-11 text-base"
          />
        )}
      </Field>

      <Field label={t('fields.severity')}>
        {(control) => (
          <select
            {...control}
            name="severity"
            defaultValue={record?.severity ?? 'low'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            {SAFETY_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {t(`severity.${severity}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      {mode === 'edit' ? (
        <Field label={t('fields.status')}>
          {(control) => (
            <select
              {...control}
              name="status"
              defaultValue={record?.status ?? 'open'}
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            >
              {SAFETY_RECORD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      <details className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">
          {t('fields.peopleInvolved')} / {t('fields.immediateAction')}
        </summary>
        <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] px-4 py-4">
          <Field label={t('fields.peopleInvolved')}>
            {(control) => (
              <Textarea
                {...control}
                name="peopleInvolved"
                rows={2}
                defaultValue={record?.peopleInvolved ?? ''}
                className="min-h-16 text-base"
              />
            )}
          </Field>
          <Field label={t('fields.immediateAction')}>
            {(control) => (
              <Textarea
                {...control}
                name="immediateAction"
                rows={2}
                defaultValue={record?.immediateAction ?? ''}
                className="min-h-16 text-base"
              />
            )}
          </Field>
        </div>
      </details>

      {recordType === 'toolbox_talk' && mode === 'create' ? (
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <Field label={t('fields.topic')} required>
            {(control) => <Input {...control} name="topic" className="h-11 text-base" />}
          </Field>
          <Field label={t('fields.talkDate')}>
            {(control) => <Input {...control} type="date" name="talkDate" className="h-11 text-base" />}
          </Field>
          <Field label={t('fields.talkNotes')}>
            {(control) => <Textarea {...control} name="talkNotes" rows={2} className="min-h-16 text-base" />}
          </Field>
          <Field label={t('fields.attendees')} description={t('create.attendeeNamesHint')}>
            {(control) => <Textarea {...control} name="attendeeNames" rows={3} className="min-h-20 text-base" />}
          </Field>
        </div>
      ) : null}

      <Button type="submit" className="h-11 w-full sm:w-auto" loading={pending}>
        {pending ? tCommon('states.saving') : mode === 'create' ? t('actions.create') : t('actions.save')}
      </Button>
    </form>
  );
}
