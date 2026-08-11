import {
  COMPLETENESS_CHECK_KEYS,
  type CompletenessCheckItem,
  type CompletenessCheckKey,
  type CompletenessSnapshot,
} from './types';

export interface CompletenessCheckInput {
  readonly key: CompletenessCheckKey;
  /** When false, excluded from the overall percent (transparent N/A). */
  readonly applicable: boolean;
  readonly issueCount: number;
  readonly sampleEntityIds?: readonly string[];
}

function clampNonNegative(count: number): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

/**
 * Deterministic completeness scoring.
 *
 * Each applicable check is pass (0 issues → 100) or fail (any issues → 0).
 * Overall percent = 100 × passed / applicable. No applicable checks → 100.
 * Non-applicable checks remain in the drilldown with scorePercent 100.
 */
export function buildCompletenessItems(
  inputs: readonly CompletenessCheckInput[],
): CompletenessCheckItem[] {
  const byKey = new Map(inputs.map((input) => [input.key, input]));

  return COMPLETENESS_CHECK_KEYS.map((key) => {
    const input = byKey.get(key);
    const applicable = input?.applicable ?? false;
    const issueCount = clampNonNegative(input?.issueCount ?? 0);
    const sampleEntityIds = (input?.sampleEntityIds ?? []).slice(0, 20);
    const passed = !applicable || issueCount === 0;
    return {
      key,
      applicable,
      issueCount: applicable ? issueCount : 0,
      sampleEntityIds: applicable ? sampleEntityIds : [],
      scorePercent: passed ? 100 : 0,
    };
  });
}

export function scoreCompleteness(
  inputs: readonly CompletenessCheckInput[],
  options: { yearMonth: string; computedAt?: string } ,
): CompletenessSnapshot {
  const items = buildCompletenessItems(inputs);
  const applicable = items.filter((item) => item.applicable);
  const passedCount = applicable.filter((item) => item.issueCount === 0).length;
  const applicableCount = applicable.length;
  const percent =
    applicableCount === 0 ? 100 : Math.round((100 * passedCount) / applicableCount);

  return {
    yearMonth: options.yearMonth,
    computedAt: options.computedAt ?? new Date().toISOString(),
    percent,
    applicableCount,
    passedCount,
    items,
  };
}

export function formatCompletenessPercent(percent: number): string {
  const safe = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return safe.toFixed(6);
}

export function isCompletenessReady(snapshot: CompletenessSnapshot): boolean {
  return snapshot.percent >= 100;
}
