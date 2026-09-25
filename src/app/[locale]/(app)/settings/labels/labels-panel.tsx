'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createLabelAction, updateLabelAction, archiveLabelAction, type LabelActionState } from './actions';

interface TaskLabel {
  id: string;
  name: string;
  color: string | null;
  isArchived: boolean;
}

function LabelRow({ label, canEdit }: { label: TaskLabel; canEdit: boolean }) {
  const t = useTranslations('settings.labelsPanel');
  const tActions = useTranslations('common.actions');
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(updateLabelAction, {} as LabelActionState);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveLabelAction, {} as LabelActionState);
  const [editName, setEditName] = useState(label.name);
  const [editColor, setEditColor] = useState(label.color ?? '#6366f1');

  return (
    <div className={`flex flex-col gap-2 border-b border-[var(--pf-border-default)] py-3 last:border-0 ${label.isArchived ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex h-5 items-center rounded-full px-2 text-xs font-medium text-white"
          style={{ backgroundColor: label.color ?? '#64748b' }}
        >
          {label.name}
        </span>
        {label.isArchived && (
          <Badge tone="neutral" className="text-xs text-[var(--pf-text-muted)]">{t('archivedBadge')}</Badge>
        )}
        <div className="ml-auto flex gap-1">
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
                {editing ? tActions('cancel') : tActions('edit')}
              </Button>
              <form action={archiveAction}>
                <input type="hidden" name="id" value={label.id} />
                <input type="hidden" name="restore" value={label.isArchived ? 'true' : 'false'} />
                <Button type="submit" size="sm" variant="ghost" loading={archivePending}>
                  {label.isArchived ? tActions('restore') : tActions('archive')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      {editing && (
        <form action={updateAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="id" value={label.id} />
          <div className="flex flex-wrap gap-3">
            <Input
              name="name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('labelName')}
              className="flex-1"
              required
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--pf-text-secondary)]">{t('color')}</label>
              <input
                type="color"
                name="color"
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-[var(--pf-border-default)]"
              />
            </div>
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

function CreateLabelForm({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('settings.labelsPanel');
  const tActions = useTranslations('common.actions');
  const [state, action, pending] = useActionState(createLabelAction, {} as LabelActionState);
  const [color, setColor] = useState('#6366f1');

  if (!canEdit) return null;

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
      <p className="text-sm font-medium">{t('addNew')}</p>
      <div className="flex flex-wrap gap-3">
        <Input name="name" placeholder={t('labelName')} className="flex-1" required />
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--pf-text-secondary)]">{t('color')}</label>
          <input
            type="color"
            name="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-12 cursor-pointer rounded border border-[var(--pf-border-default)]"
          />
        </div>
      </div>
      <div>
        <Button type="submit" size="sm" loading={pending}>{t('createLabel')}</Button>
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success" role="status">{state.message}</Alert>}
    </form>
  );
}

export function LabelsPanel({ labels, canEdit }: { labels: TaskLabel[]; canEdit: boolean }) {
  const t = useTranslations('settings.labelsPanel');
  const active = labels.filter((l) => !l.isArchived);
  const archived = labels.filter((l) => l.isArchived);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>

      <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
        {active.length === 0 && (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('emptyState')}</p>
        )}
        {active.map((label) => (
          <LabelRow key={label.id} label={label} canEdit={canEdit} />
        ))}
      </div>

      <CreateLabelForm canEdit={canEdit} />

      {archived.length > 0 && (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? t('hideArchived') : t('showArchived', { count: archived.length })}
          </Button>
          {showArchived && (
            <div className="mt-2 rounded-lg border border-[var(--pf-border-default)] p-4 opacity-60">
              {archived.map((label) => (
                <LabelRow key={label.id} label={label} canEdit={canEdit} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
