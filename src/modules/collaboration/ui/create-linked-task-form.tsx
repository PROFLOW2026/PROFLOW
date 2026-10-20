'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { cn } from '@/shared/ui/cn';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
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
      className="flex flex-col gap-3"
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
      <MainAppFormGrid dense>
        <Field label={t('taskTitleLabel')} required className={mainAppFieldSpan.full}>
          {(control) => (
            <Input
              {...control}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={500}
              required
            />
          )}
        </Field>
        {error ? (
          <p className={cn(mainAppFieldSpan.full, 'text-sm text-[var(--pf-status-danger-fg)]')}>{error}</p>
        ) : null}
        <div className={mainAppFieldSpan.full}>
          <Button type="submit" disabled={pending || !title.trim()} size="sm">
            {pending ? t('creating') : t('createButton')}
          </Button>
        </div>
      </MainAppFormGrid>
    </form>
  );
}
