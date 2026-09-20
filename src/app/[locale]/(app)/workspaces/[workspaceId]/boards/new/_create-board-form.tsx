'use client';

import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBoardAction } from '../../../actions';
import type { WorkspaceActionState } from '../../../actions';

const INITIAL: WorkspaceActionState = {};

export function CreateBoardForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createBoardAction.bind(null, workspaceId),
    INITIAL,
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/workspaces/${workspaceId}/boards`);
      router.refresh();
    }
  }, [state.success, router, workspaceId]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="board-name">{t('boards.createNameLabel')}</Label>
        <Input id="board-name" name="name" required maxLength={120} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" value="true" />
        {t('boards.default')}
      </label>
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{state.error}</p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {t('boards.createBoard')}
      </Button>
    </form>
  );
}
