import type { ExternalTaskCommandType, ExternalTaskStatus } from './task-lifecycle';

export type ContractorTaskWorkGuideStepKey = 'acknowledge' | 'drawing' | 'photo' | 'submit';

export interface ContractorTaskWorkGuideStep {
  readonly key: ContractorTaskWorkGuideStepKey;
  /** In-page anchor (`#…`) or app path for the linked control. */
  readonly href: string;
}

export function buildContractorTaskWorkGuideSteps(input: {
  readonly canAct: boolean;
  readonly availableCommands: readonly ExternalTaskCommandType[];
  readonly status: ExternalTaskStatus;
  readonly drawingDrawingId: string | null;
  readonly canCaptureInfra: boolean;
}): ContractorTaskWorkGuideStep[] {
  const steps: ContractorTaskWorkGuideStep[] = [];
  if (input.canAct && input.availableCommands.includes('acknowledge')) {
    steps.push({ key: 'acknowledge', href: '#contractor-task-commands' });
  }
  if (input.drawingDrawingId) {
    steps.push({ key: 'drawing', href: '#contractor-task-drawing' });
  }
  const openForFieldWork =
    input.status !== 'closed' && input.status !== 'cancelled' && input.status !== 'approved';
  if (input.canCaptureInfra && openForFieldWork) {
    steps.push({ key: 'photo', href: '#contractor-task-infra' });
  }
  if (input.canAct && input.availableCommands.includes('submit_completion')) {
    steps.push({ key: 'submit', href: '#contractor-task-commands' });
  }
  return steps;
}
