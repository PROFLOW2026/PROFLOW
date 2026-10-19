/**
 * One active material-pressure alert per trade.
 *
 * Identity is the trade, not the calendar week. A repeat of the same
 * reason+score keeps read state. A different reason or score replaces the
 * previous alert and shows again for that recipient only.
 */

export function materialPressureDedupeKey(trade: string): string {
  return `material_pressure_alert:${trade}`;
}

export function materialPressureEventSignature(reason: string, score: number): string {
  return `${reason}:${Math.round(score)}`;
}

export function materialPressureEventSignatureFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  if (typeof record.eventSignature === 'string' && record.eventSignature.length > 0) {
    return record.eventSignature;
  }
  if (typeof record.reason !== 'string' || record.reason.length === 0) return null;
  const score =
    typeof record.score === 'number'
      ? record.score
      : typeof record.score === 'string'
        ? Number(record.score)
        : Number.NaN;
  if (!Number.isFinite(score)) return null;
  return materialPressureEventSignature(record.reason, score);
}

export interface MaterialPressureHistoryRow {
  readonly dedupeKey: string;
  readonly eventSignature: string | null;
  readonly readAt: Date | null;
  readonly resolvedAt: Date | null;
}

export interface MaterialPressureEmitPlan {
  readonly dedupeKey: string;
  readonly eventSignature: string;
  /** Previous stable alert was read and the event signature changed. */
  readonly reopenRead: boolean;
  /** Every open copy of this same signature was already read. Do not revive it. */
  readonly preserveRead: boolean;
}

export function planMaterialPressureEmit(
  history: readonly MaterialPressureHistoryRow[],
  input: { readonly trade: string; readonly reason: string; readonly score: number },
): MaterialPressureEmitPlan {
  const dedupeKey = materialPressureDedupeKey(input.trade);
  const eventSignature = materialPressureEventSignature(input.reason, input.score);
  const stable = history.find((row) => row.dedupeKey === dedupeKey && row.resolvedAt == null);
  const reopenRead = Boolean(
    stable?.readAt && stable.eventSignature && stable.eventSignature !== eventSignature,
  );
  const openSameSignature = history.filter(
    (row) => row.resolvedAt == null && row.eventSignature === eventSignature,
  );
  const preserveRead =
    !stable && openSameSignature.length > 0 && openSameSignature.every((row) => row.readAt != null);

  return { dedupeKey, eventSignature, reopenRead, preserveRead };
}

export interface SimulatedMaterialPressureAlert {
  readonly id: string;
  readonly trade: string;
  readonly dedupeKey: string;
  readonly eventSignature: string;
  readonly readAt: Date | null;
  readonly resolvedAt: Date | null;
}

/** In-memory mirror of emit + supersede used by unit tests. */
export function applyMaterialPressureEmission(
  rows: readonly SimulatedMaterialPressureAlert[],
  input: {
    readonly trade: string;
    readonly reason: string;
    readonly score: number;
    readonly newId: string;
    readonly now: Date;
  },
): SimulatedMaterialPressureAlert[] {
  const plan = planMaterialPressureEmit(rows, input);
  const next = rows.map((row) => ({ ...row }));
  const index = next.findIndex((row) => row.dedupeKey === plan.dedupeKey && row.trade === input.trade);
  if (index < 0) {
    next.push({
      id: input.newId,
      trade: input.trade,
      dedupeKey: plan.dedupeKey,
      eventSignature: plan.eventSignature,
      readAt: plan.preserveRead ? input.now : null,
      resolvedAt: null,
    });
  } else {
    const current = next[index]!;
    next[index] = {
      ...current,
      eventSignature: plan.eventSignature,
      readAt: plan.reopenRead ? null : current.readAt,
      resolvedAt: null,
    };
  }

  return next.map((row) => {
    if (row.trade !== input.trade) return row;
    if (row.dedupeKey === plan.dedupeKey) return row;
    if (row.resolvedAt) return row;
    return { ...row, resolvedAt: input.now };
  });
}

export function activeMaterialPressureIds(
  rows: readonly SimulatedMaterialPressureAlert[],
): string[] {
  return rows
    .filter((row) => row.resolvedAt == null && row.readAt == null)
    .map((row) => row.id);
}
