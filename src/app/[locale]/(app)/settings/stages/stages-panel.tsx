'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createStageAction,
  updateStageAction,
  archiveStageAction,
  setDefaultStageAction,
  type StageActionState,
} from './actions';

const _STAGE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
];

const WORK_KIND_OPTIONS = [
  { value: 'all', label: 'All work kinds' },
  { value: 'project', label: 'Projects only' },
  { value: 'job', label: 'Jobs only' },
  { value: 'work_order', label: 'Work orders only' },
];

interface StageDef {
  id: string;
  name: string;
  color: string | null;
  position: number;
  isDefault: boolean;
  isArchived: boolean;
  workKindFilter: string | null;
}

function StageRow({
  stage,
  canEdit,
}: {
  stage: StageDef;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(updateStageAction, {} as StageActionState);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveStageAction, {} as StageActionState);
  const [defaultState, defaultAction, defaultPending] = useActionState(setDefaultStageAction, {} as StageActionState);

  const [editName, setEditName] = useState(stage.name);
  const [editColor, setEditColor] = useState(stage.color ?? '');

  return (
    <div className={`flex flex-col gap-2 border-b border-[var(--pf-border-default)] py-3 last:border-0 ${stage.isArchived ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Color dot */}
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-[var(--pf-border-default)]"
          style={{ backgroundColor: stage.color ?? '#64748b' }}
        />
        <span className="min-w-0 flex-1 font-medium">{stage.name}</span>

        {stage.isDefault && (
          <Badge tone="success" className="text-xs">Default</Badge>
        )}
        {stage.isArchived && (
          <Badge tone="neutral" className="text-xs text-[var(--pf-text-muted)]">Archived</Badge>
        )}
        {stage.workKindFilter && (
          <Badge tone="info" className="text-xs">
            {WORK_KIND_OPTIONS.find((o) => o.value === stage.workKindFilter)?.label ?? stage.workKindFilter}
          </Badge>
        )}

        {canEdit && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel' : 'Edit'}
            </Button>

            {!stage.isDefault && !stage.isArchived && (
              <form action={defaultAction}>
                <input type="hidden" name="id" value={stage.id} />
                <Button type="submit" size="sm" variant="ghost" loading={defaultPending}>
                  Set default
                </Button>
              </form>
            )}

            <form action={archiveAction}>
              <input type="hidden" name="id" value={stage.id} />
              <input type="hidden" name="restore" value={stage.isArchived ? 'true' : 'false'} />
              <Button type="submit" size="sm" variant="ghost" loading={archivePending}>
                {stage.isArchived ? 'Restore' : 'Archive'}
              </Button>
            </form>
          </div>
        )}
      </div>

      {editing && (
        <form action={updateAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="id" value={stage.id} />
          <div className="flex flex-wrap gap-3">
            <Input
              name="name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Stage name"
              className="flex-1"
              required
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--pf-text-secondary)]">Color</label>
              <input
                type="color"
                name="color"
                value={editColor || '#64748b'}
                onChange={(e) => setEditColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-[var(--pf-border-default)]"
              />
            </div>
          </div>
          <Select name="workKindFilter" defaultValue={stage.workKindFilter ?? 'all'}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={updatePending}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
          {updateState.error && <Alert tone="danger">{updateState.error}</Alert>}
          {updateState.ok && <Alert tone="success" role="status">{updateState.message}</Alert>}
        </form>
      )}

      {(archiveState.error ?? defaultState.error) && (
        <Alert tone="danger">{archiveState.error ?? defaultState.error}</Alert>
      )}
    </div>
  );
}

function CreateStageForm({ canEdit }: { canEdit: boolean }) {
  const [state, action, pending] = useActionState(createStageAction, {} as StageActionState);
  const [color, setColor] = useState('#6366f1');

  if (!canEdit) return null;

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
      <p className="text-sm font-medium">Add new stage</p>
      <div className="flex flex-wrap gap-3">
        <Input name="name" placeholder="Stage name" className="flex-1" required />
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--pf-text-secondary)]">Color</label>
          <input
            type="color"
            name="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-12 cursor-pointer rounded border border-[var(--pf-border-default)]"
          />
        </div>
      </div>
      <Select name="workKindFilter" defaultValue="all">
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WORK_KIND_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div>
        <Button type="submit" size="sm" loading={pending}>Create stage</Button>
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success" role="status">{state.message}</Alert>}
    </form>
  );
}

export function StagesPanel({
  stages,
  canEdit,
}: {
  stages: StageDef[];
  canEdit: boolean;
}) {
  const active = stages.filter((s) => !s.isArchived);
  const archived = stages.filter((s) => s.isArchived);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">
        Stage definitions appear in your project headers and tracking views. Drag to reorder (coming soon).
        Archiving a stage hides it from new projects — existing data is preserved.
      </p>

      <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
        {active.length === 0 && (
          <p className="text-sm text-[var(--pf-text-muted)]">No stages defined yet.</p>
        )}
        {active.map((stage) => (
          <StageRow key={stage.id} stage={stage} canEdit={canEdit} />
        ))}
      </div>

      <CreateStageForm canEdit={canEdit} />

      {archived.length > 0 && (
        <div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? 'Hide archived' : `Show ${archived.length} archived`}
          </Button>
          {showArchived && (
            <div className="mt-2 rounded-lg border border-[var(--pf-border-default)] p-4 opacity-60">
              {archived.map((stage) => (
                <StageRow key={stage.id} stage={stage} canEdit={canEdit} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
