'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { archiveProjectAction } from '../actions';

export function ArchiveProjectButton({ projectId }: { projectId: string }) {
  const t = useTranslations('projects.workspace');
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      loading={pending}
      onClick={() => {
        if (window.confirm(t('archiveConfirm'))) {
          startTransition(async () => {
            await archiveProjectAction(projectId);
          });
        }
      }}
    >
      {t('archive')}
    </Button>
  );
}
