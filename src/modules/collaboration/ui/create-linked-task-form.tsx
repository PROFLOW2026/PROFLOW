'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createEntityFollowUpTaskAction } from './actions';

export function CreateLinkedTaskForm({
  projectId,
  entityType,
  entityId,
  defaultTitle,
}: {
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly defaultTitle: string;
}) {
  const t = useTranslations('collaboration.linkedTasks');
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createEntityFollowUpTaskAction({
            projectId,
            entityType,
            entityId,
            title: title.trim(),
          });
          if (!result.ok) {
            setError(result.error ?? t('createFailed'));
            return;
          }
          router.refresh();
        });
      }}
    >
      <label className="text-sm font-medium">{t('taskTitleLabel')}</label>
      <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} required />
      {error ? <p className="text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
      <Button type="submit" disabled={pending || !title.trim()} size="sm">
        {pending ? t('creating') : t('createButton')}
      </Button>
    </form>
  );
}
