'use client';

import { useActionState, useState } from 'react';
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

const PRIORITY_OPTIONS = [
  { value: 'none', label: 'No priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

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

function TemplateRow({ template, canEdit }: { template: TaskTemplateDef; canEdit: boolean }) {
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
              <Badge tone="neutral" className="text-xs">{template.priority}</Badge>
            )}
            {template.items.length > 0 && (
              <Badge tone="neutral" className="text-xs">{template.items.length} checklist items</Badge>
            )}
            {template.isArchived && (
              <Badge tone="neutral" className="text-xs text-[var(--pf-text-muted)]">Archived</Badge>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel' : 'Edit'}
            </Button>
            <form action={archiveAction}>
              <input type="hidden" name="id" value={template.id} />
              <input type="hidden" name="restore" value={template.isArchived ? 'true' : 'false'} />
              <Button type="submit" size="sm" variant="ghost" loading={archivePending}>
                {template.isArchived ? 'Restore' : 'Archive'}
              </Button>
            </form>
          </div>
        )}
      </div>

      {editing && (
        <form action={updateAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="id" value={template.id} />
          <Input name="title" defaultValue={template.title} placeholder="Template title" required />
          <Textarea name="description" defaultValue={template.description ?? ''} placeholder="Description (optional)" rows={2} />
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--pf-text-secondary)]">Priority</label>
            <Select name="priority" defaultValue={template.priority}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={updatePending}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
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
  const [state, action, pending] = useActionState(createTaskTemplateAction, {} as TemplateActionState);
  const [checklistItems, setChecklistItems] = useState<string[]>(['']);

  if (!canEdit) return null;

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
      <p className="text-sm font-medium">Create task template</p>
      <Input name="title" placeholder="Template title" required />
      <Textarea name="description" placeholder="Description (optional)" rows={2} />
      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--pf-text-secondary)]">Priority</label>
        <Select name="priority" defaultValue="none">
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[var(--pf-text-secondary)]">Checklist items</p>
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
            placeholder={`Item ${idx + 1}`}
          />
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setChecklistItems([...checklistItems, ''])}
        >
          + Add item
        </Button>
      </div>
      <div>
        <Button type="submit" size="sm" loading={pending}>Create template</Button>
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
  const active = templates.filter((t) => !t.isArchived);
  const archived = templates.filter((t) => t.isArchived);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">
        Task templates pre-fill new tasks with a title, description, priority, and checklist items.
      </p>

      <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
        {active.length === 0 && (
          <p className="text-sm text-[var(--pf-text-muted)]">No task templates yet.</p>
        )}
        {active.map((t) => (
          <TemplateRow key={t.id} template={t} canEdit={canEdit} />
        ))}
      </div>

      <CreateTemplateForm canEdit={canEdit} />

      {archived.length > 0 && (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide archived' : `Show ${archived.length} archived`}
          </Button>
          {showArchived && (
            <div className="mt-2 rounded-lg border border-[var(--pf-border-default)] p-4 opacity-60">
              {archived.map((t) => (
                <TemplateRow key={t.id} template={t} canEdit={canEdit} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
