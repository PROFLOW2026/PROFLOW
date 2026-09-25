/**
 * Project Stage History Panel.
 *
 * Renders an immutable timeline of stage transitions for a project.
 * Uses Server Component data fetching pattern — accepts pre-fetched data.
 */

import { getTranslations } from 'next-intl/server';

interface StageDef {
  id: string;
  name: string;
  color: string | null;
}

interface StageTransition {
  id: string;
  fromStageId: string | null;
  toStageId: string;
  transitionedAt: Date;
  notes: string | null;
  transitionedByName: string | null;
}

interface ProjectStageHistoryProps {
  transitions: StageTransition[];
  stageMap: Record<string, StageDef>;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StageChip({
  stage,
  unknownLabel,
}: {
  stage: StageDef | undefined;
  unknownLabel: string;
}) {
  if (!stage) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pf-border-default)] px-2 py-0.5 text-xs text-[var(--pf-text-muted)]">
        {unknownLabel}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: stage.color ? `${stage.color}20` : 'var(--pf-surface-secondary)',
        color: stage.color ?? 'var(--pf-text-secondary)',
        border: `1px solid ${stage.color ?? 'var(--pf-border-default)'}`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: stage.color ?? '#64748b' }}
      />
      {stage.name}
    </span>
  );
}

export async function ProjectStageHistory({ transitions, stageMap }: ProjectStageHistoryProps) {
  const t = await getTranslations('tasks.stageHistory');

  if (transitions.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-[var(--pf-text-muted)]">{t('empty')}</div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {transitions.map((transition, idx) => {
        const fromStage = transition.fromStageId ? stageMap[transition.fromStageId] : null;
        const toStage = stageMap[transition.toStageId];
        const isLatest = idx === 0;

        return (
          <div key={transition.id} className="relative flex gap-4 pb-4">
            <div className="flex flex-col items-center">
              <div
                className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                  isLatest
                    ? 'border-[var(--pf-brand-primary)] bg-[var(--pf-brand-primary)]'
                    : 'border-[var(--pf-border-default)] bg-[var(--pf-surface-primary)]'
                }`}
              />
              {idx < transitions.length - 1 && (
                <div className="mt-1 flex-1 border-l border-dashed border-[var(--pf-border-default)]" />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {fromStage ? (
                  <>
                    <StageChip stage={fromStage} unknownLabel={t('unknown')} />
                    <span className="text-xs text-[var(--pf-text-muted)]">→</span>
                    <StageChip stage={toStage} unknownLabel={t('unknown')} />
                  </>
                ) : (
                  <>
                    <span className="text-xs text-[var(--pf-text-muted)]">{t('startedAt')}</span>
                    <StageChip stage={toStage} unknownLabel={t('unknown')} />
                  </>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[var(--pf-text-muted)]">
                {formatDate(transition.transitionedAt)}
                {transition.transitionedByName && ` · ${transition.transitionedByName}`}
              </p>
              {transition.notes && (
                <p className="mt-1 rounded bg-[var(--pf-surface-secondary)] px-2 py-1 text-xs text-[var(--pf-text-secondary)]">
                  {transition.notes}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
