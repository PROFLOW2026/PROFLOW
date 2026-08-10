'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { isProjectSoftArchived } from '@/modules/projects/domain/soft-archive';
import type { ProjectStatus } from '@/modules/projects/domain/types';
import { archiveProjectAction, restoreProjectAction } from '../actions';

interface ArchiveProjectButtonProps {
  projectId: string;
  status: ProjectStatus;
  archivedAt: Date | null;
}

export function ArchiveProjectButton({
  projectId,
  status,
  archivedAt,
}: ArchiveProjectButtonProps) {
  const t = useTranslations('projects.workspace');
  const [pending, startTransition] = useTransition();
  const softArchived = isProjectSoftArchived({ status, archivedAt });

  if (softArchived) {
    return (
      <Button
        type="button"
        variant="secondary"
        loading={pending}
        onClick={() => {
          startTransition(async () => {
            await restoreProjectAction(projectId);
          });
        }}
      >
        {t('restore')}
      </Button>
    );
  }

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
