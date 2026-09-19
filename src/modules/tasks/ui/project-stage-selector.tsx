'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { transitionProjectStageAction, type StageTransitionActionState } from './project-stage-actions';

interface StageDef {
  id: string;
  name: string;
  color: string | null;
}

interface ProjectStageSelectorProps {
  projectId: string;
  currentStageId: string | null;
  stages: StageDef[];
  /** Whether the user has permission to change the stage. */
  canTransition: boolean;
}

/**
 * Stage selector for the project header / detail page.
 *
 * Shows the current stage as a colored badge. If the user has permission,
 * clicking it opens a dropdown to select a new stage, which creates a new
 * `project_stage_transitions` row.
 */
export function ProjectStageSelector({
  projectId,
  currentStageId,
  stages,
  canTransition,
}: ProjectStageSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [state, action, pending] = useActionState(transitionProjectStageAction, {} as StageTransitionActionState);

  const currentStage = stages.find((s) => s.id === currentStageId) ?? null;
  const availableStages = stages.filter((s) => s.id !== currentStageId);

  const _handleStageSelect = (stageId: string) => {
    setSelectedStageId(stageId);
    setOpen(false);
  };

  return (
    <div className="relative flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {/* Current stage badge */}
        <button
          type="button"
          onClick={() => canTransition && setOpen(!open)}
          disabled={!canTransition || pending}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            canTransition
              ? 'cursor-pointer hover:opacity-80'
              : 'cursor-default'
          }`}
          style={{
            backgroundColor: currentStage?.color
              ? `${currentStage.color}20`
              : 'var(--pf-surface-secondary)',
            color: currentStage?.color ?? 'var(--pf-text-secondary)',
            border: `1.5px solid ${currentStage?.color ?? 'var(--pf-border-default)'}`,
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: currentStage?.color ?? '#64748b' }}
          />
          {currentStage?.name ?? 'No stage'}
          {canTransition && (
            <svg
              className="h-3 w-3 opacity-60"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          )}
        </button>
      </div>

      {/* Dropdown */}
      {open && availableStages.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-48 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-surface-primary)] shadow-lg">
          <form action={action}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="toStageId" value={selectedStageId ?? ''} />
            <div className="p-1">
              {availableStages.map((stage) => (
                <button
                  key={stage.id}
                  type="submit"
                  name="toStageId"
                  value={stage.id}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--pf-surface-hover)]"
                  onClick={() => setOpen(false)}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: stage.color ?? '#64748b' }}
                  />
                  {stage.name}
                </button>
              ))}
            </div>
          </form>
        </div>
      )}

      {/* Click outside to close */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {state.error && (
        <Alert tone="danger" className="mt-1 text-xs">
          {state.error}
        </Alert>
      )}
    </div>
  );
}
