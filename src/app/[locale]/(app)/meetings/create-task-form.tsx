'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { MeetingActionItem } from '@/modules/meetings';
import { createTaskFromActionItemAction, type MeetingFormState } from './actions';

const NONE = '__none__';

export function CreateTaskFromActionItemForm({
  meetingId,
  actionItem,
  workspaces,
  projects,
  defaultWorkspaceId,
  defaultProjectId,
}: {
  meetingId: string;
  actionItem: MeetingActionItem;
  workspaces: readonly { id: string; name: string }[];
  projects: readonly { id: string; name: string }[];
  defaultWorkspaceId?: string | null;
  defaultProjectId?: string | null;
}) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<MeetingFormState, FormData>(
    createTaskFromActionItemAction,
    {},
  );
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId ?? workspaces[0]?.id ?? NONE);
  const [projectId, setProjectId] = useState(defaultProjectId ?? NONE);

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="actionItemId" value={actionItem.id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <MainAppFormGrid dense>
      <Field label={t('meetings.form.workspaceRequired')} required error={state.fieldErrors?.workspaceId} className={mainAppFieldSpan.lg}>
        {(control) => (
          <>
            <input type="hidden" name="workspaceId" value={workspaceId === NONE ? '' : workspaceId} />
            <select
              {...control}
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              required
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            >
              {workspaces.length === 0 ? (
                <option value={NONE} disabled>
                  —
                </option>
              ) : null}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </>
        )}
      </Field>

      <Field label={t('meetings.form.project')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
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

      <Field
        label={t('meetings.form.taskTitle')}
        optionalLabel={t('meetings.form.taskTitleHint')}
        error={state.fieldErrors?.title}
        className={mainAppFieldSpan.lg}
      >
        {(control) => (
          <Input
            {...control}
            name="title"
            placeholder={actionItem.title}
            className="h-11 text-base"
          />
        )}
      </Field>

      <Field label={t('meetings.form.dueDate')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.md}>
        {(control) => (
          <Input
            {...control}
            name="dueDate"
            type="date"
            defaultValue={actionItem.dueDate ?? ''}
            className="h-11 text-base"
          />
        )}
      </Field>
      </MainAppFormGrid>

      <Button type="submit" loading={pending} disabled={workspaces.length === 0} block>
        {t('meetings.form.submitCreateTask')}
      </Button>
    </form>
  );
}
