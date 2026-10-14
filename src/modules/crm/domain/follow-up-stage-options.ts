import type { OpportunityStage, OpportunityStatus } from './types';

const FOLLOW_UP_STAGES: readonly OpportunityStage[] = [
  'qualify',
  'estimate',
  'quote',
  'negotiation',
  'lost',
] as const;

/**
 * Follow-up stage dropdown: "won" is not a manual move — win comes from product quote conversion.
 */
export function followUpStageSelectOptions(
  currentStage: OpportunityStage,
  currentStatus: OpportunityStatus,
): readonly OpportunityStage[] {
  if (currentStatus === 'won' || currentStage === 'won') {
    return ['won', ...FOLLOW_UP_STAGES];
  }
  return FOLLOW_UP_STAGES;
}

export function isFollowUpWonStageDisabled(currentStatus: OpportunityStatus): boolean {
  return currentStatus !== 'won';
}
