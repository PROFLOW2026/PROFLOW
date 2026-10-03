'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import type { ExternalTaskCommandType } from '../domain/task-lifecycle';
import { contractorTaskCommandAction } from './actions';
import type { CollabActionState } from '../shared/action-state.types';

export function ContractorTaskCommandForm({
  organizationId,
  projectId,
  taskId,
  commands,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly commands: readonly ExternalTaskCommandType[];
}) {
  const t = useTranslations('collaboration');
  const [state, formAction, pending] = useActionState(contractorTaskCommandAction, {} as CollabActionState);

  if (commands.length === 0) return null;

  const primary = commands[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="taskId" value={taskId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {commands.includes('submit_completion') ? (
        <Input name="note" placeholder={t('portal.tasks.completionNote')} maxLength={4000} />
      ) : null}
      {commands.map((command) => (
        <Button
          key={command}
          type="submit"
          name="command"
          value={command}
          variant={command === primary ? 'primary' : 'secondary'}
          size="md"
          block
          disabled={pending}
        >
          {t(`portal.tasks.command.${command}`)}
        </Button>
      ))}
    </form>
  );
}
