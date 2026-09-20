'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MeetingRecord } from '@/modules/meetings';
import {
  createMeetingAction,
  updateMeetingAction,
  type MeetingFormState,
} from './actions';

const NONE = '__none__';

function toDatetimeLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function MeetingForm({
  mode,
  meeting,
  projects,
  workspaces,
  defaultScheduledAt,
  defaultProjectId,
  defaultWorkspaceId,
}: {
  mode: 'create' | 'edit';
  meeting?: MeetingRecord;
  projects: readonly { id: string; name: string }[];
  workspaces: readonly { id: string; name: string }[];
  defaultScheduledAt?: Date;
  defaultProjectId?: string;
  defaultWorkspaceId?: string;
}) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const action = mode === 'create' ? createMeetingAction : updateMeetingAction;
  const [state, formAction, pending] = useActionState<MeetingFormState, FormData>(action, {});
  const [projectId, setProjectId] = useState(
    meeting?.projectId ?? defaultProjectId ?? NONE,
  );
  const [workspaceId, setWorkspaceId] = useState(
    meeting?.workspaceId ?? defaultWorkspaceId ?? NONE,
  );

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {meeting ? <input type="hidden" name="meetingId" value={meeting.id} /> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('meetings.fields.title')} required error={state.fieldErrors?.title}>
        {(control) => (
          <Input
            {...control}
            name="title"
            required
            defaultValue={meeting?.title ?? ''}
            className="h-11 text-base"
          />
        )}
      </Field>

      <Field label={t('meetings.form.scheduledAt')} required error={state.fieldErrors?.scheduledAt}>
        {(control) => (
          <Input
            {...control}
            name="scheduledAt"
            type="datetime-local"
            required
            defaultValue={
              meeting
                ? toDatetimeLocal(meeting.scheduledAt)
                : defaultScheduledAt
                  ? toDatetimeLocal(defaultScheduledAt)
                  : undefined
            }
            className="h-11 text-base"
          />
        )}
      </Field>

      <Field label={t('meetings.fields.location')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input
            {...control}
            name="location"
            defaultValue={meeting?.location ?? ''}
            className="h-11 text-base"
          />
        )}
      </Field>

      <Field label={t('meetings.form.project')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <>
            <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
            <select
              {...control}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            >
              <option value={NONE}>{t('meetings.form.projectNone')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </>
        )}
      </Field>

      <Field label={t('meetings.form.workspace')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <>
            <input type="hidden" name="workspaceId" value={workspaceId === NONE ? '' : workspaceId} />
            <select
              {...control}
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            >
              <option value={NONE}>{t('meetings.form.workspaceNone')}</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </>
        )}
      </Field>

      <Field label={t('meetings.fields.notes')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Textarea
            {...control}
            name="notes"
            rows={4}
            defaultValue={meeting?.notes ?? ''}
            className="min-h-24 text-base"
          />
        )}
      </Field>

      <Button type="submit" loading={pending} block>
        {mode === 'create' ? t('meetings.form.submitCreate') : tCommon('actions.save')}
      </Button>
    </form>
  );
}
