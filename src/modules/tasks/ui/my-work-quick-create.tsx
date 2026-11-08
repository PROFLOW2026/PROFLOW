'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/shared/i18n/navigation';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { CreateTaskInput } from '@/modules/tasks';
import { resolveQuickCreateProjectIdAction } from './resolve-quick-create-project-id';
import { TaskCreateForm } from './task-create-form';

export interface MyWorkQuickCreateProps {
  readonly canCreate: boolean;
  readonly defaultWorkspaceId: string | null;
  readonly createTask: (data: CreateTaskInput) => Promise<void>;
}

/**
 * Opens task create when FAB or deep link sets ?new=1 on /work.
 * projectId is applied only after the server confirms the caller can access that project.
 */
export function MyWorkQuickCreate({
  canCreate,
  defaultWorkspaceId,
  createTask,
}: MyWorkQuickCreateProps) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const searchParams = useSearchParams();
  const wantsCreate = searchParams.get('new') === '1';
  const requestedProjectId = searchParams.get('projectId');
  const [open, setOpen] = useState(
    () => wantsCreate && canCreate && Boolean(defaultWorkspaceId),
  );
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null);
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const sheetOpen = open || (wantsCreate && canCreate && Boolean(defaultWorkspaceId));
  const projectReady = !requestedProjectId || resolvedFor === requestedProjectId;
  const accessibleProjectId = projectReady && requestedProjectId ? resolvedProjectId : null;

  useEffect(() => {
    if (!requestedProjectId) return;
    let cancelled = false;
    void resolveQuickCreateProjectIdAction(requestedProjectId)
      .then((projectId) => {
        if (cancelled) return;
        setResolvedProjectId(projectId);
        setResolvedFor(requestedProjectId);
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedProjectId(null);
        setResolvedFor(requestedProjectId);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedProjectId]);

  if (!canCreate || !defaultWorkspaceId) return null;

  const clearNewParam = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('new');
    const qs = next.toString();
    router.replace(qs ? `/work?${qs}` : '/work', { scroll: false });
  };

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) clearNewParam();
      }}
    >
      <SheetContent side="end" className="w-full sm:max-w-lg" closeLabel={t('close')}>
        <SheetHeader>
          <SheetTitle>{t('create.title')}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {projectReady ? (
            <TaskCreateForm
              defaultWorkspaceId={defaultWorkspaceId}
              defaultProjectId={accessibleProjectId}
              onSubmit={async (data) => {
                await createTask({
                  ...(data as CreateTaskInput),
                  projectId: accessibleProjectId,
                });
                setOpen(false);
                clearNewParam();
                router.refresh();
              }}
              onCancel={() => {
                setOpen(false);
                clearNewParam();
              }}
            />
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
