'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import type { ExternalTaskCommandType } from '../domain/task-lifecycle';
import { internalTaskCommandAction } from './actions';
import type { CollabActionState } from '../shared/action-state.types';

export function InternalTaskCommandForm({
  taskId,
  projectId,
  commands,
}: {
  readonly taskId: string;
  readonly projectId: string;
  readonly commands: readonly ExternalTaskCommandType[];
}) {
  const t = useTranslations('collaboration');
  const [state, formAction, pending] = useActionState(internalTaskCommandAction, {} as CollabActionState);

  if (commands.length === 0) return null;

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {commands.includes('verify') ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('internalCommands.verify')}</legend>
          <select name="outcome" className="min-h-11 rounded-md border px-2 text-sm" defaultValue="approved">
            <option value="approved">{t('verificationOutcome.approved')}</option>
            <option value="approved_with_remarks">{t('verificationOutcome.approved_with_remarks')}</option>
            <option value="rejected">{t('verificationOutcome.rejected')}</option>
            <option value="rework_required">{t('verificationOutcome.rework_required')}</option>
          </select>
          <select name="quality" className="min-h-11 rounded-md border px-2 text-sm">
            <option value="">{t('internalCommands.qualityOptional')}</option>
            <option value="satisfactory">{t('quality.satisfactory')}</option>
            <option value="needs_attention">{t('quality.needs_attention')}</option>
            <option value="unacceptable">{t('quality.unacceptable')}</option>
          </select>
          <Input name="note" placeholder={t('internalCommands.notePlaceholder')} maxLength={4000} />
          <Button type="submit" name="command" value="verify" size="sm" disabled={pending}>
            {t('internalCommands.submitVerify')}
          </Button>
        </fieldset>
      ) : null}
      {commands.includes('close') ? (
        <Button type="submit" name="command" value="close" size="sm" variant="primary" disabled={pending}>
          {t('internalCommands.close')}
        </Button>
      ) : null}
      {commands.includes('reopen') ? (
        <fieldset className="flex flex-col gap-2">
          <Input name="note" placeholder={t('internalCommands.reopenReason')} maxLength={4000} required />
          <Button type="submit" name="command" value="reopen" size="sm" variant="secondary" disabled={pending}>
            {t('internalCommands.reopen')}
          </Button>
        </fieldset>
      ) : null}
      {commands.includes('cancel') ? (
        <fieldset className="flex flex-col gap-2">
          <Input name="note" placeholder={t('internalCommands.cancelReason')} maxLength={4000} required />
          <Button type="submit" name="command" value="cancel" size="sm" variant="danger" disabled={pending}>
            {t('internalCommands.cancel')}
          </Button>
        </fieldset>
      ) : null}
    </form>
  );
}
