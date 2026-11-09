'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  createWorkspaceTaskFromTemplateAction,
  type WorkspaceActionState,
} from './actions';

const INITIAL: WorkspaceActionState = {};

export function ApplyWorkspaceTemplateForm({
  workspaceId,
  boardId,
  templates,
}: {
  readonly workspaceId: string;
  readonly boardId: string | null;
  readonly templates: readonly { id: string; title: string }[];
}) {
  const t = useTranslations('tasks');
  const [state, action, pending] = useActionState(createWorkspaceTaskFromTemplateAction, INITIAL);
  if (templates.length === 0 || !boardId) return null;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="boardId" value={boardId} />
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span>{t('boards.fromTemplate')}</span>
        <select name="templateId" required className="min-h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2">
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.title}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" size="md" disabled={pending}>
        {t('boards.applyTemplate')}
      </Button>
      {state.error ? <p className="text-sm text-[var(--pf-text-danger)]">{state.error}</p> : null}
    </form>
  );
}
