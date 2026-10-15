'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createWorkspaceAction,
  type WorkspaceActionState,
} from '@/app/[locale]/(app)/workspaces/actions';

const INITIAL: WorkspaceActionState = {};

export function CreateWorkspaceForm() {
  const t = useTranslations('tasks');
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createWorkspaceAction, INITIAL);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-4">
      <h2 className="text-sm font-semibold">{t('workspaces.create.title')}</h2>
      <div>
        <label htmlFor="workspace-name" className="text-sm font-medium">
          {t('workspaces.create.nameLabel')}
        </label>
        <Input id="workspace-name" name="name" required autoComplete="off" className="mt-1" />
      </div>
      <div>
        <label htmlFor="workspace-type" className="text-sm font-medium">
          {t('workspaces.create.typeLabel')}
        </label>
        <select
          id="workspace-type"
          name="workspaceType"
          defaultValue="org_internal"
          className="mt-1 block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-2 text-sm"
        >
          <option value="org_internal">{t('workspaces.type.org_internal')}</option>
          <option value="team">{t('workspaces.type.team')}</option>
        </select>
      </div>
      <input type="hidden" name="workspaceVisibility" value="organization" />
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.fieldErrors?.name ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{state.fieldErrors.name}</p>
      ) : null}
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {pending ? t('saving') : t('workspaces.create.submit')}
      </Button>
    </form>
  );
}
