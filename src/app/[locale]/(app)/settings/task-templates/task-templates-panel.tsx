'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createTaskTemplateAction,
  updateTaskTemplateAction,
  archiveTaskTemplateAction,
  type TemplateActionState,
} from './actions';

const PRIORITY_VALUES = ['none', 'low', 'medium', 'high', 'urgent'] as const;

interface TaskTemplateItem {
  id: string;
  title: string;
  sortKey: string;
}

interface TaskTemplateDef {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  isArchived: boolean;
  items: TaskTemplateItem[];
}

function usePriorityOptions() {
  const tPriority = useTranslations('tasks.priority');
  return useMemo(
    () => PRIORITY_VALUES.map((value) => ({ value, label: tPriority(value) })),
    [tPriority],
  );
}

function TemplateRow({ template, canEdit }: { template: TaskTemplateDef; canEdit: boolean }) {
  const t = useTranslations('settings.taskTemplatesPanel');
  const tActions = useTranslations('common.actions');
  const tPriority = useTranslations('tasks.priority');
  const priorityOptions = usePriorityOptions();
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(updateTaskTemplateAction, {} as TemplateActionState);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveTaskTemplateAction, {} as TemplateActionState);

  return (
    <div className={`flex flex-col gap-2 border-b border-[var(--pf-border-default)] py-3 last:border-0 ${template.isArchived ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{template.title}</p>
          {template.description && (
            <p className="text-sm text-[var(--pf-text-secondary)]">{template.description}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {template.priority !== 'none' && (
              <Badge tone="neutral" className="text-xs">{tPriority(template.priority as typeof PRIORITY_VALUES[number])}</Badge>
            )}
            {template.items.length > 0 && (
              <Badge tone="neutral" className="text-xs">{t('checklistCount', { count: template.items.length })}</Badge>
            )}
            {template.isArchived && (
              <Badge tone="neutral" className="text-xs text-[var(--pf-text-muted)]">{t('archivedBadge')}</Badge>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
              {editing ? tActions('cancel') : tActions('edit')}
            </Button>
            <form action={archiveAction}>
              <input type="hidden" name="id" value={template.id} />
              <input type="hidden" name="restore" value={template.isArchived ? 'true' : 'false'} />
              <Button type="submit" size="sm" variant="ghost" loading={archivePending}>
                {template.isArchived ? tActions('restore') : tActions('archive')}
              </Button>
            </form>
          </div>
        )}
      </div>

      {editing && (
        <form action={updateAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="id" value={template.id} />
          <Input name="title" defaultValue={template.title} placeholder={t('templateTitle')} required />
          <Textarea name="description" defaultValue={template.description ?? ''} placeholder={t('descriptionOptional')} rows={2} />
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--pf-text-secondary)]">{t('priority')}</label>
            <Select name="priority" defaultValue={template.priority}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={updatePending}>{tActions('save')}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{tActions('cancel')}</Button>
          </div>
          {updateState.error && <Alert tone="danger">{updateState.error}</Alert>}
          {updateState.ok && <Alert tone="success" role="status">{updateState.message}</Alert>}
        </form>
      )}
      {archiveState.error && <Alert tone="danger">{archiveState.error}</Alert>}
    </div>
  );
}

function CreateTemplateForm({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('settings.taskTemplatesPanel');
  const priorityOptions = usePriorityOptions();
  const [state, action, pending] = useActionState(createTaskTemplateAction, {} as TemplateActionState);
  const [checklistItems, setChecklistItems] = useState<string[]>(['']);

  if (!canEdit) return null;

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
      <p className="text-sm font-medium">{t('createTitle')}</p>
      <Input name="title" placeholder={t('templateTitle')} required />
      <Textarea name="description" placeholder={t('descriptionOptional')} rows={2} />
      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--pf-text-secondary)]">{t('priority')}</label>
        <Select name="priority" defaultValue="none">
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorityOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('checklistItems')}</p>
        {checklistItems.map((item, idx) => (
          <Input
            key={idx}
            name={`checklistItem_${idx}`}
            value={item}
            onChange={(e) => {
              const next = [...checklistItems];
              next[idx] = e.target.value;
              setChecklistItems(next);
            }}
            placeholder={t('itemPlaceholder', { index: idx + 1 })}
          />
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setChecklistItems([...checklistItems, ''])}
        >
          {t('addItem')}
        </Button>
      </div>
      <div>
        <Button type="submit" size="sm" loading={pending}>{t('createTemplate')}</Button>
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success" role="status">{state.message}</Alert>}
    </form>
  );
}

export function TaskTemplatesPanel({
  templates,
  canEdit,
}: {
  templates: TaskTemplateDef[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.taskTemplatesPanel');
  const active = templates.filter((tpl) => !tpl.isArchived);
  const archived = templates.filter((tpl) => tpl.isArchived);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>

      <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
        {active.length === 0 && (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('emptyState')}</p>
        )}
        {active.map((tpl) => (
          <TemplateRow key={tpl.id} template={tpl} canEdit={canEdit} />
        ))}
      </div>

      <CreateTemplateForm canEdit={canEdit} />

      {archived.length > 0 && (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? t('hideArchived') : t('showArchived', { count: archived.length })}
          </Button>
          {showArchived && (
            <div className="mt-2 rounded-lg border border-[var(--pf-border-default)] p-4 opacity-60">
              {archived.map((tpl) => (
                <TemplateRow key={tpl.id} template={tpl} canEdit={canEdit} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
