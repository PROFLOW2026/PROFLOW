import { OPPORTUNITY_STAGES, type OpportunityStage, type OpportunityStatus } from './types';

export interface OpportunityBoardCard {
  readonly id: string;
  readonly name: string;
  readonly stage: OpportunityStage;
  readonly status: OpportunityStatus;
  readonly expectedValueAmount: string | null;
  readonly currency: string | null;
  readonly expectedStartDate: string | null;
  readonly notes: string | null;
  readonly nextActionAt: Date | string | null;
  readonly nextActionText: string | null;
}

export type NextActionUrgency = 'overdue' | 'due';

/**
 * Board/detail badge for a stored next_action_at. No email is sent.
 * `due` = scheduled and not yet past; `overdue` = past the due instant.
 */
export function nextActionUrgency(
  nextActionAt: Date | string | null | undefined,
  now: Date = new Date(),
): NextActionUrgency | null {
  if (nextActionAt == null || nextActionAt === '') return null;
  const due = typeof nextActionAt === 'string' ? new Date(nextActionAt) : nextActionAt;
  if (Number.isNaN(due.getTime())) return null;
  return due.getTime() < now.getTime() ? 'overdue' : 'due';
}

export interface PipelineColumn<T extends { readonly stage: string }> {
  readonly stage: string;
  readonly items: readonly T[];
}

/**
 * Client-side kanban columns from the existing opportunity list.
 * Empty stages stay visible so the pipeline shape is always qualify→lost.
 */
export function groupOpportunitiesByStage<T extends { readonly stage: string }>(
  items: readonly T[],
  stages: readonly string[] = OPPORTUNITY_STAGES,
): PipelineColumn<T>[] {
  const buckets = new Map<string, T[]>();
  for (const stage of stages) {
    buckets.set(stage, []);
  }

  for (const item of items) {
    const existing = buckets.get(item.stage);
    if (existing) {
      existing.push(item);
    } else {
      buckets.set(item.stage, [item]);
    }
  }

  const extraStages = [...buckets.keys()].filter((stage) => !stages.includes(stage));
  return [...stages, ...extraStages].map((stage) => ({
    stage,
    items: buckets.get(stage) ?? [],
  }));
}

export function isOpportunityStage(value: string): value is OpportunityStage {
  return (OPPORTUNITY_STAGES as readonly string[]).includes(value);
}

/**
 * Board / follow-up stage moves. Lost closes the opportunity. Won is a pipeline
 * column only - converting to a project happens on `/quotes`, not here.
 * Moving off lost reopens the record.
 */
export function statusForMovedStage(
  stage: OpportunityStage,
  currentStatus: OpportunityStatus,
): OpportunityStatus | undefined {
  if (stage === 'lost') return 'lost';
  if (stage === 'won') return undefined;
  if (currentStatus === 'lost' || currentStatus === 'cancelled') return 'open';
  return undefined;
}
