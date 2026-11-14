import type { TakeoffJobStatus, TakeoffJobStage } from '../domain/contracts';

const TERMINAL: ReadonlySet<TakeoffJobStatus> = new Set(['succeeded', 'partial', 'failed', 'cancelled']);

export function canTransitionJob(from: TakeoffJobStatus, to: TakeoffJobStatus): boolean {
  if (from === to) return true;
  if (TERMINAL.has(from)) return false;
  if (to === 'cancelled') return from === 'queued' || from === 'running';
  if (from === 'queued' && to === 'running') return true;
  if (from === 'running' && (to === 'succeeded' || to === 'partial' || to === 'failed')) return true;
  return false;
}

export function mergeJobProgress(
  current: { stage: TakeoffJobStage; percent: number },
  incoming: { stage: TakeoffJobStage; percent: number },
): { stage: TakeoffJobStage; percent: number } {
  if (incoming.percent < current.percent) return current;
  return incoming;
}

export function jobFailurePreservesPriorResults(status: TakeoffJobStatus): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'partial';
}