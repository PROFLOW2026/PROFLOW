'use client';

import { Copy, FileStack, Loader2, Save } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { TaskTemplateUi } from './_task-api-stub';

interface TaskDetailActionsProps {
  taskId: string;
  workspaceId: string;
  projectId: string | null;
  boardId: string | null;
  bucketId: string | null;
  onDuplicate: (
    taskId: string,
    options?: { includeAssignees?: boolean },
  ) => Promise<{ success?: boolean; error?: string; newTaskId?: string }>;
  onSaveAsTemplate: (
    taskId: string,
  ) => Promise<{ success?: boolean; error?: string; templateId?: string }>;
  onCreateFromTemplate: (
    input: {
      templateId: string;
      workspaceId: string;
      projectId?: string | null;
      boardId?: string | null;
      bucketId?: string | null;
    },
  ) => Promise<{ success?: boolean; error?: string; newTaskId?: string }>;
  listTemplates: () => Promise<TaskTemplateUi[]>;
}

export function TaskDetailActions({
  taskId,
  workspaceId,
  projectId,
  boardId,
  bucketId,
  onDuplicate,
  onSaveAsTemplate,
  onCreateFromTemplate,
  listTemplates,
}: TaskDetailActionsProps) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplateUi[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const openTemplatePicker = () => {
    setTemplatePickerOpen(true);
    setLoadingTemplates(true);
    void (async () => {
      try {
        const rows = await listTemplates();
        setTemplates(rows);
      } finally {
        setLoadingTemplates(false);
      }
    })();
  };

  const runAction = (
    action: () => Promise<{ success?: boolean; error?: string; newTaskId?: string; templateId?: string }>,
    successKey: string,
  ) => {
    startTransition(() => {
      void (async () => {
        setMessage(null);
        const result = await action();
        if (result.error) {
          setMessage({ type: 'error', text: result.error });
          return;
        }
        setMessage({ type: 'success', text: t(successKey) });
        if (result.newTaskId) {
          router.push(`/tasks/${result.newTaskId}`);
        }
      })();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => runAction(() => onDuplicate(taskId), 'actions.duplicateSuccess')}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm hover:bg-[var(--pf-bg-muted)] disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
          {t('actions.duplicate')}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            runAction(() => onSaveAsTemplate(taskId), 'actions.saveTemplateSuccess')
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm hover:bg-[var(--pf-bg-muted)] disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {t('actions.saveAsTemplate')}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={openTemplatePicker}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm hover:bg-[var(--pf-bg-muted)] disabled:opacity-50"
        >
          <FileStack className="size-3.5" />
          {t('actions.createFromTemplate')}
        </button>
      </div>

      {templatePickerOpen ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('actions.pickTemplate')}</p>
            <button
              type="button"
              className="text-xs text-[var(--pf-text-secondary)]"
              onClick={() => setTemplatePickerOpen(false)}
            >
              {t('cancel')}
            </button>
          </div>
          {loadingTemplates ? (
            <div className="flex justify-center py-2">
              <Loader2 className="size-4 animate-spin text-[var(--pf-text-muted)]" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('actions.noTemplates')}</p>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    disabled={isPending}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-[var(--pf-bg-muted)]"
                    onClick={() =>
                      runAction(
                        () =>
                          onCreateFromTemplate({
                            templateId: template.id,
                            workspaceId,
                            projectId,
                            boardId,
                            bucketId,
                          }),
                        'actions.createFromTemplateSuccess',
                      )
                    }
                  >
                    <span className="min-w-0 truncate">{template.title}</span>
                    <span className="shrink-0 text-xs text-[var(--pf-text-muted)]">
                      {template.itemCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {message ? (
        <p
          className={
            message.type === 'success'
              ? 'text-sm text-[var(--pf-status-success-fg)]'
              : 'text-sm text-[var(--pf-status-danger-fg)]'
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
