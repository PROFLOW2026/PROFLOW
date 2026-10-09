'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/shared/i18n/navigation';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { CreateTaskInput } from '@/modules/tasks';
import { TaskCreateForm } from './task-create-form';

export interface MyWorkQuickCreateProps {
  readonly canCreate: boolean;
  readonly defaultWorkspaceId: string | null;
  readonly createTask: (data: CreateTaskInput) => Promise<void>;
}

/**
 * Opens task create when FAB or deep link sets ?new=1 on /work.
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
  const [open, setOpen] = useState(
    () => wantsCreate && canCreate && Boolean(defaultWorkspaceId),
  );
  const sheetOpen = open || (wantsCreate && canCreate && Boolean(defaultWorkspaceId));

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
          <TaskCreateForm
            defaultWorkspaceId={defaultWorkspaceId}
            onSubmit={async (data) => {
              await createTask(data as CreateTaskInput);
              setOpen(false);
              clearNewParam();
              router.refresh();
            }}
            onCancel={() => {
              setOpen(false);
              clearNewParam();
            }}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
