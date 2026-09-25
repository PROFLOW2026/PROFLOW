'use client';

/**
 * PlanningWritePanel — Gantt write UI overlay for planning_work_items.
 *
 * Renders above the read-only ProjectPlanningPanel when canWrite=true.
 * All persistence is through server actions in planning-actions.ts.
 * No CPM, no critical path — light planning only.
 */

import React, { useActionState, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import type {
  PlanningDependency,
  PlanningWorkItem,
  PlanningWorkItemKind,
} from '../domain/types';
import type {
  archivePlanningWorkItemAction,
  createPlanningWorkItemAction,
  removePlanningDependencyAction,
  setPlanningDependencyAction,
  updatePlanningWorkItemAction,
  PlanningActionState,
} from '@/app/[locale]/(app)/projects/planning-actions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanningWritePanelProps {
  readonly projectId: string;
  readonly workItems: readonly PlanningWorkItem[];
  readonly dependencies: readonly PlanningDependency[];
  readonly phaseNames?: Readonly<Record<string, string>>;
  readonly createAction: typeof createPlanningWorkItemAction;
  readonly updateAction: typeof updatePlanningWorkItemAction;
  readonly archiveAction: typeof archivePlanningWorkItemAction;
  readonly setDepAction: typeof setPlanningDependencyAction;
  readonly removeDepAction: typeof removePlanningDependencyAction;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-sm text-[var(--pf-text-primary)] placeholder:text-[var(--pf-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--pf-status-info-fg)]';

const BTN_PRIMARY =
  'rounded bg-[var(--pf-status-info-fg)] px-3 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50';

const BTN_SECONDARY =
  'rounded border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-1 text-sm text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-muted)] disabled:opacity-50';

const BTN_DANGER =
  'rounded border border-[var(--pf-status-danger-fg)] px-3 py-1 text-sm text-[var(--pf-status-danger-fg)] hover:bg-[var(--pf-status-danger-bg)] disabled:opacity-50';

// ─── Add Item Form ────────────────────────────────────────────────────────────

function AddItemForm({
  projectId,
  kind,
  phaseId,
  createAction,
  onClose,
}: {
  projectId: string;
  kind: PlanningWorkItemKind;
  phaseId?: string | null;
  createAction: typeof createPlanningWorkItemAction;
  onClose: () => void;
}) {
  const t = useTranslations('planning.write');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<PlanningActionState, FormData>(
    createAction,
    {},
  );
  const nameLabel =
    kind === 'milestone' ? t('fields.milestoneName') : t('fields.taskName');
  const endDateLabel =
    kind === 'milestone' ? t('fields.milestoneDate') : t('fields.targetEndDate');

  return (
    <form
      action={formAction}
      className="mt-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 space-y-2"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="kind" value={kind} />
      {phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}

      <div className="flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-[var(--pf-text-secondary)] mb-0.5">
            {nameLabel}
          </label>
          <input
            name="name"
            required
            autoFocus
            placeholder={nameLabel}
            className={INPUT_CLASS}
          />
          {state.fieldErrors?.name ? (
            <p className="text-xs text-[var(--pf-status-danger-fg)]">{state.fieldErrors.name}</p>
          ) : null}
        </div>

        {kind !== 'milestone' && (
          <div className="min-w-[110px]">
            <label className="block text-xs text-[var(--pf-text-secondary)] mb-0.5">
              {t('fields.startDate')}
            </label>
            <input type="date" name="startDate" className={INPUT_CLASS} />
          </div>
        )}

        <div className="min-w-[110px]">
          <label className="block text-xs text-[var(--pf-text-secondary)] mb-0.5">
            {endDateLabel}
          </label>
          <input type="date" name="targetEndDate" className={INPUT_CLASS} />
        </div>
      </div>

      {state.error ? (
        <p className="text-xs text-[var(--pf-status-danger-fg)]">{state.error}</p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? tCommon('states.saving') : tCommon('actions.add')}
        </button>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          {tCommon('actions.cancel')}
        </button>
      </div>
    </form>
  );
}

// ─── Edit Item Form ────────────────────────────────────────────────────────────

function EditItemForm({
  item,
  projectId,
  updateAction,
  onClose,
}: {
  item: PlanningWorkItem;
  projectId: string;
  updateAction: typeof updatePlanningWorkItemAction;
  onClose: () => void;
}) {
  const t = useTranslations('planning.write');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<PlanningActionState, FormData>(
    updateAction,
    {},
  );
  const endDateLabel =
    item.kind === 'milestone' ? t('fields.milestoneDate') : t('fields.targetEndDate');

  return (
    <form
      action={formAction}
      className="mt-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 space-y-2"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="workItemId" value={item.id} />
      <input type="hidden" name="kind" value={item.kind} />
      {item.phaseId ? <input type="hidden" name="phaseId" value={item.phaseId} /> : null}

      <div className="flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-[var(--pf-text-secondary)] mb-0.5">
            {t('fields.name')}
          </label>
          <input
            name="name"
            required
            defaultValue={item.name}
            className={INPUT_CLASS}
          />
          {state.fieldErrors?.name ? (
            <p className="text-xs text-[var(--pf-status-danger-fg)]">{state.fieldErrors.name}</p>
          ) : null}
        </div>

        {item.kind !== 'milestone' && (
          <div className="min-w-[110px]">
            <label className="block text-xs text-[var(--pf-text-secondary)] mb-0.5">
              {t('fields.startDate')}
            </label>
            <input
              type="date"
              name="startDate"
              defaultValue={item.startDate ?? ''}
              className={INPUT_CLASS}
            />
          </div>
        )}

        <div className="min-w-[110px]">
          <label className="block text-xs text-[var(--pf-text-secondary)] mb-0.5">
            {endDateLabel}
          </label>
          <input
            type="date"
            name="targetEndDate"
            defaultValue={item.targetEndDate ?? ''}
            className={INPUT_CLASS}
          />
        </div>

        {item.kind !== 'milestone' && (
          <div className="min-w-[90px]">
            <label className="block text-xs text-[var(--pf-text-secondary)] mb-0.5">
              {t('fields.progressPercent')}
            </label>
            <input
              type="number"
              name="progressPercent"
              min="0"
              max="100"
              defaultValue={Math.round(item.progressPercent)}
              className={INPUT_CLASS}
            />
          </div>
        )}
      </div>

      {state.error ? (
        <p className="text-xs text-[var(--pf-status-danger-fg)]">{state.error}</p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? tCommon('states.saving') : tCommon('actions.save')}
        </button>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          {tCommon('actions.cancel')}
        </button>
      </div>
    </form>
  );
}

// ─── Archive Confirm ───────────────────────────────────────────────────────────

function ArchiveConfirm({
  projectId,
  workItemId,
  itemName,
  archiveAction,
  onClose,
}: {
  projectId: string;
  workItemId: string;
  itemName: string;
  archiveAction: typeof archivePlanningWorkItemAction;
  onClose: () => void;
}) {
  const t = useTranslations('planning.write');
  const tCommon = useTranslations('common');
  const [, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      await archiveAction(projectId, workItemId);
      onClose();
    });
  }

  return (
    <div className="mt-1 rounded-lg border border-[var(--pf-status-danger-fg)] bg-[var(--pf-status-danger-bg)] p-3 text-sm space-y-2">
      <p className="text-[var(--pf-status-danger-fg)] font-medium">
        {t('archive.title', { name: itemName })}
      </p>
      <p className="text-xs text-[var(--pf-text-secondary)]">{t('archive.hint')}</p>
      <div className="flex gap-2">
        <button type="button" onClick={handleArchive} className={BTN_DANGER}>
          {tCommon('actions.archive')}
        </button>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          {tCommon('actions.cancel')}
        </button>
      </div>
    </div>
  );
}

// ─── Add Dependency Form ───────────────────────────────────────────────────────

function AddDependencyForm({
  projectId,
  successorId,
  workItems,
  currentDeps,
  setDepAction,
  onClose,
}: {
  projectId: string;
  successorId: string;
  workItems: readonly PlanningWorkItem[];
  currentDeps: readonly PlanningDependency[];
  setDepAction: typeof setPlanningDependencyAction;
  onClose: () => void;
}) {
  const t = useTranslations('planning.write');
  const tCommon = useTranslations('common');
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Items that are not the current item and not already a predecessor
  const existingPredecessorIds = new Set(
    currentDeps.filter((d) => d.successorId === successorId).map((d) => d.predecessorId),
  );
  const candidates = workItems.filter(
    (w) => w.id !== successorId && !existingPredecessorIds.has(w.id),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const predecessorId = fd.get('predecessorId') as string;
    if (!predecessorId) return;
    startTransition(async () => {
      const result = await setDepAction(projectId, predecessorId, successorId);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 space-y-2"
    >
      <label className="block text-xs text-[var(--pf-text-secondary)]">
        {t('dependency.addLabel')}
      </label>
      <select name="predecessorId" required className={INPUT_CLASS}>
        <option value="">{t('dependency.selectPlaceholder')}</option>
        {candidates.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-[var(--pf-status-danger-fg)]">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY}>
          {tCommon('actions.add')}
        </button>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          {tCommon('actions.cancel')}
        </button>
      </div>
    </form>
  );
}

// ─── Row Actions ──────────────────────────────────────────────────────────────

type RowMode = 'view' | 'edit' | 'archive' | 'dep';

function WriteItemRow({
  item,
  projectId,
  workItems,
  dependencies,
  updateAction,
  archiveAction,
  setDepAction,
  removeDepAction,
}: {
  item: PlanningWorkItem;
  projectId: string;
  workItems: readonly PlanningWorkItem[];
  dependencies: readonly PlanningDependency[];
  updateAction: typeof updatePlanningWorkItemAction;
  archiveAction: typeof archivePlanningWorkItemAction;
  setDepAction: typeof setPlanningDependencyAction;
  removeDepAction: typeof removePlanningDependencyAction;
}) {
  const t = useTranslations('planning');
  const tWrite = useTranslations('planning.write');
  const tCommon = useTranslations('common');
  const [mode, setMode] = useState<RowMode>('view');
  const [, startTransition] = useTransition();
  const myDeps = dependencies.filter((d) => d.successorId === item.id);

  function removeDep(dependencyId: string) {
    startTransition(async () => {
      await removeDepAction(projectId, dependencyId);
    });
  }

  const predecessorNames = myDeps.map((d) => ({
    id: d.id,
    name: workItems.find((w) => w.id === d.predecessorId)?.name ?? d.predecessorId.slice(0, 8),
  }));

  return (
    <li className="border-t border-[var(--pf-border-default)] pt-2 pb-1 px-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex-1 text-sm font-medium text-[var(--pf-text-primary)] truncate">
          {item.name}
        </span>
        {item.kind === 'milestone' ? (
          <span className="text-xs text-[var(--pf-text-secondary)] px-1 py-0.5 border border-[var(--pf-border-default)] rounded">
            ◆ {t('milestone')}
          </span>
        ) : null}
        <span className="text-xs text-[var(--pf-text-secondary)]">
          {item.targetEndDate ?? tWrite('noDate')}
        </span>

        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            aria-label={tWrite('editAria', { name: item.name })}
            onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}
            className={cn(
              BTN_SECONDARY,
              'text-xs px-2',
              mode === 'edit' && 'bg-[var(--pf-bg-muted)]',
            )}
          >
            ✏ {tWrite('editShort')}
          </button>
          <button
            type="button"
            aria-label={tWrite('dependency.addAria', { name: item.name })}
            onClick={() => setMode((m) => (m === 'dep' ? 'view' : 'dep'))}
            className={cn(BTN_SECONDARY, 'text-xs px-2')}
          >
            ↗ {tWrite('dependencyShort')}
          </button>
          <button
            type="button"
            aria-label={tWrite('archiveAria', { name: item.name })}
            onClick={() => setMode((m) => (m === 'archive' ? 'view' : 'archive'))}
            className={cn(BTN_DANGER, 'text-xs px-2')}
          >
            {tCommon('actions.archive')}
          </button>
        </div>
      </div>

      {predecessorNames.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {predecessorNames.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-1.5 py-0.5 text-xs text-[var(--pf-text-secondary)]"
            >
              ← {p.name}
              <button
                type="button"
                aria-label={tWrite('dependency.removeAria', { name: p.name })}
                onClick={() => removeDep(p.id)}
                className="text-[var(--pf-text-secondary)] hover:text-[var(--pf-status-danger-fg)] leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {mode === 'edit' && (
        <EditItemForm
          item={item}
          projectId={projectId}
          updateAction={updateAction}
          onClose={() => setMode('view')}
        />
      )}
      {mode === 'archive' && (
        <ArchiveConfirm
          projectId={projectId}
          workItemId={item.id}
          itemName={item.name}
          archiveAction={archiveAction}
          onClose={() => setMode('view')}
        />
      )}
      {mode === 'dep' && (
        <AddDependencyForm
          projectId={projectId}
          successorId={item.id}
          workItems={workItems}
          currentDeps={dependencies}
          setDepAction={setDepAction}
          onClose={() => setMode('view')}
        />
      )}
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlanningWritePanel({
  projectId,
  workItems,
  dependencies,
  phaseNames: _phaseNames = {},
  createAction,
  updateAction,
  archiveAction,
  setDepAction,
  removeDepAction,
}: PlanningWritePanelProps) {
  const tWrite = useTranslations('planning.write');
  const [addKind, setAddKind] = useState<PlanningWorkItemKind | null>(null);

  return (
    <section
      className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 space-y-4"
      aria-label={tWrite('sectionAria')}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-[var(--pf-text-primary)]">
          {tWrite('sectionTitle')}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAddKind((k) => (k === 'task' ? null : 'task'))}
            className={cn(BTN_SECONDARY, 'text-xs', addKind === 'task' && 'bg-[var(--pf-bg-muted)]')}
          >
            + {tWrite('addTask')}
          </button>
          <button
            type="button"
            onClick={() => setAddKind((k) => (k === 'milestone' ? null : 'milestone'))}
            className={cn(
              BTN_SECONDARY,
              'text-xs',
              addKind === 'milestone' && 'bg-[var(--pf-bg-muted)]',
            )}
          >
            ◆ {tWrite('addMilestone')}
          </button>
        </div>
      </div>

      {addKind ? (
        <AddItemForm
          projectId={projectId}
          kind={addKind}
          createAction={createAction}
          onClose={() => setAddKind(null)}
        />
      ) : null}

      {workItems.length > 0 ? (
        <ul className="space-y-1">
          {workItems.map((item) => (
            <WriteItemRow
              key={item.id}
              item={item}
              projectId={projectId}
              workItems={workItems}
              dependencies={dependencies}
              updateAction={updateAction}
              archiveAction={archiveAction}
              setDepAction={setDepAction}
              removeDepAction={removeDepAction}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{tWrite('emptyItems')}</p>
      )}
    </section>
  );
}
